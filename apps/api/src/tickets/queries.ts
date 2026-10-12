import { and, count, desc, eq, ilike, or } from "drizzle-orm";
import { db } from "../db/client";
import {
  accounts,
  teams,
  ticketMessages,
  tickets,
  type TicketSource,
  type TicketStatus,
  type TextEditorContentRow,
  type TicketMessageSource,
} from "../db/schema";
import { generateTicketToken, hashTicketToken } from "./token";
import { enqueueOutboxJob } from "../email/outbox";
import { publishInboxUpdate } from "./live";
import { withDbTransaction } from "../db/transaction";
import {
  mintAccessGrant,
  seedLegacyGrant,
  verifyTicketAccessToken,
} from "../inbox-ai/grants";
import { enqueueInboxAiRun, ticketsChannelForSource } from "../inbox-ai/schedule";
import { enqueueTicketMail } from "../inbox-ai/mail";

function ticketContactSourcePath(source: TicketSource): string {
  if (source === "chatbot") return "/chat";
  if (source === "api") return "/api";
  if (source === "email") return "/email";
  return "/help";
}

export const textTicketMessage = (text: string): TextEditorContentRow => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});

export function ticketMessageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!content || typeof content !== "object") return "";
  const value = content as Record<string, unknown>;
  const ownText = typeof value.text === "string" ? value.text : "";
  const childText = Array.isArray(value.content)
    ? value.content.map(ticketMessageText).join("")
    : "";
  return `${ownText}${childText}`;
}

export async function createTicket(input: {
  teamId: string;
  subject: string;
  message: string;
  requesterEmail: string | null;
  requesterName?: string;
  source: TicketSource;
  scheduleAi?: boolean;
}) {
  const { token, tokenHash } = generateTicketToken();

  const { ticket, firstMessage } = await withDbTransaction(async (tx) => {
    const [created] = await tx
      .insert(tickets)
      .values({
        teamId: input.teamId,
        subject: input.subject,
        requesterEmail: input.requesterEmail,
        requesterName: input.requesterName,
        source: input.source,
        accessTokenHash: tokenHash,
      })
      .returning();

    const [message] = await tx
      .insert(ticketMessages)
      .values({
        teamId: input.teamId,
        ticketId: created.id,
        author: "requester",
        content: textTicketMessage(input.message),
      })
      .returning();

    await tx
      .update(tickets)
      .set({
        aiGeneration: 1,
        aiTriggerMessageId: message.id,
        updatedAt: new Date(),
      })
      .where(eq(tickets.id, created.id));

    await seedLegacyGrant(input.teamId, created.id, tokenHash, tx);
    return {
      ticket: {
        ...created,
        aiGeneration: 1,
        aiTriggerMessageId: message.id,
      },
      firstMessage: message,
    };
  });

  if (input.requesterEmail) {
    await enqueueOutboxJob(input.teamId, "contact_sync", {
      email: input.requesterEmail,
      ...(input.requesterName ? { name: input.requesterName } : {}),
      sourcePath: ticketContactSourcePath(input.source),
    });
    await enqueueTicketMail({
      teamId: input.teamId,
      ticketDbId: ticket.id,
      sequence: 1,
      kind: "receipt",
      payload: { token },
    });
  }

  if (input.scheduleAi !== false) {
    const channel = ticketsChannelForSource(input.source);
    if (channel === "tickets") {
      await enqueueInboxAiRun({
        teamId: input.teamId,
        ticketDbId: ticket.id,
        triggerMessageId: firstMessage.id,
        channel: "tickets",
      });
    }
  }

  publishInboxUpdate(input.teamId, ticket.ticketId);
  return { ticket, token, firstMessage };
}

export async function listTickets(input: {
  teamId: string;
  status?: TicketStatus;
  assigneeAccountId?: string;
  q?: string;
  offset?: number;
  itemsPerPage?: number;
}) {
  const conditions = [eq(tickets.teamId, input.teamId)];
  if (input.status) conditions.push(eq(tickets.status, input.status));
  if (input.assigneeAccountId)
    conditions.push(eq(tickets.assigneeAccountId, input.assigneeAccountId));
  if (input.q)
    conditions.push(
      or(
        ilike(tickets.subject, `%${input.q}%`),
        ilike(tickets.requesterEmail, `%${input.q}%`),
      )!,
    );

  const offset = ((input.offset ?? 1) - 1) * (input.itemsPerPage ?? 20);
  const limit = input.itemsPerPage ?? 20;

  return db.query.tickets.findMany({
    where: and(...conditions),
    limit,
    offset,
    orderBy: desc(tickets.lastMessageAt),
  });
}

export async function countTickets(input: {
  teamId: string;
  status?: TicketStatus;
  assigneeAccountId?: string;
  q?: string;
}) {
  const conditions = [eq(tickets.teamId, input.teamId)];
  if (input.status) conditions.push(eq(tickets.status, input.status));
  if (input.assigneeAccountId)
    conditions.push(eq(tickets.assigneeAccountId, input.assigneeAccountId));
  if (input.q)
    conditions.push(
      or(
        ilike(tickets.subject, `%${input.q}%`),
        ilike(tickets.requesterEmail, `%${input.q}%`),
      )!,
    );

  const [{ value }] = await db
    .select({ value: count() })
    .from(tickets)
    .where(and(...conditions));
  return value;
}

export async function getTicketByTicketId(teamId: string, ticketId: string) {
  return db.query.tickets.findFirst({
    where: and(eq(tickets.ticketId, ticketId), eq(tickets.teamId, teamId)),
  });
}

export async function getTicketMessages(ticketDbId: string) {
  return db.query.ticketMessages.findMany({
    where: eq(ticketMessages.ticketId, ticketDbId),
    orderBy: ticketMessages.createdAt,
  });
}

export async function addTicketMessage(input: {
  teamId: string;
  ticketDbId: string;
  author: "requester" | "agent" | "bot";
  authorAccountId?: string;
  content: TextEditorContentRow;
  sources?: TicketMessageSource[];
}) {
  const [message] = await db
    .insert(ticketMessages)
    .values({
      teamId: input.teamId,
      ticketId: input.ticketDbId,
      author: input.author,
      authorAccountId: input.authorAccountId,
      content: input.content,
      sources: input.sources ?? [],
    })
    .returning();

  const existing = await db.query.tickets.findFirst({
    where: eq(tickets.id, input.ticketDbId),
  });

  const patch: Record<string, unknown> = {
    lastMessageAt: new Date(),
    updatedAt: new Date(),
  };
  if (existing && existing.status !== "closed") {
    if (input.author === "agent") {
      patch.status = "pending";
      patch.aiState = "taken_over";
      patch.aiStopReason = "agent_takeover";
      patch.aiStoppedAt = new Date();
      patch.aiGeneration = existing.aiGeneration + 1;
    } else if (input.author === "requester") {
      patch.status = "open";
      patch.aiGeneration = existing.aiGeneration + 1;
      patch.aiTriggerMessageId = message.id;
      if (existing.aiState === "waiting") patch.aiState = "idle";
    }
  }

  await db.update(tickets).set(patch).where(eq(tickets.id, input.ticketDbId));

  if (
    existing &&
    input.author === "requester" &&
    existing.source !== "chatbot" &&
    existing.aiState !== "escalated" &&
    existing.aiState !== "taken_over"
  ) {
    await enqueueInboxAiRun({
      teamId: input.teamId,
      ticketDbId: existing.id,
      triggerMessageId: message.id,
      channel: "tickets",
    });
  }

  if (existing) publishInboxUpdate(input.teamId, existing.ticketId);
  return message;
}

export async function updateTicket(
  teamId: string,
  ticketId: string,
  patch: Partial<{ status: TicketStatus; assigneeAccountId: string | null }>,
) {
  const existing = await getTicketByTicketId(teamId, ticketId);
  if (!existing) return null;

  const [ticket] = await db
    .update(tickets)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(tickets.id, existing.id))
    .returning();
  if (ticket) publishInboxUpdate(teamId, ticket.ticketId);
  return ticket;
}

/** Verifies a visitor-supplied magic-link token against any unrevoked,
 * unexpired grant, falling back to the ticket's original hash. */
export async function verifyTicketAccess(
  ticket: { id: string; teamId: string; accessTokenHash: string },
  token: string,
): Promise<boolean> {
  return verifyTicketAccessToken(ticket, token);
}

/** Mints an additional access grant. Does not revoke earlier grants. */
export async function reissueTicketAccessToken(
  teamId: string,
  ticketDbId: string,
): Promise<string> {
  return mintAccessGrant(teamId, ticketDbId);
}

export { hashTicketToken };

/** Resolves who to notify for a ticket event: the assignee if set, else the
 * team's owner (architecture.md §11.2 — "assignee or team owner"). */
export async function getTicketNotificationRecipient(
  teamId: string,
  assigneeAccountId: string | null,
): Promise<string | null> {
  if (assigneeAccountId) {
    const account = await db.query.accounts.findFirst({
      where: eq(accounts.id, assigneeAccountId),
    });
    if (account) return account.email;
  }

  const [row] = await db
    .select({ email: accounts.email })
    .from(teams)
    .innerJoin(accounts, eq(teams.ownerAccountId, accounts.id))
    .where(eq(teams.id, teamId))
    .limit(1);
  return row?.email ?? null;
}
