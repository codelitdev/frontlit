import { documentationEvidenceAllowed } from "../documentation/publications";
import { and, asc, desc, eq, lte } from "drizzle-orm";
import { db } from "../db/client";
import { ticketMailOutbox, ticketMessages, tickets } from "../db/schema";
import {
  notifyRequesterOfReplies,
  notifyRequesterOfReply,
  notifyRequesterOfTicketCreated,
  type TicketMailSource,
} from "../tickets/notify";
import { getChatbotSettings } from "../chatbot/queries";
import { mintAccessGrant } from "./grants";
import { logger } from "../services/log";
import { incrementCounter } from "../services/metrics";

export async function nextTicketMailSequence(ticketDbId: string) {
  const latest = await db.query.ticketMailOutbox.findFirst({
    where: eq(ticketMailOutbox.ticketId, ticketDbId),
    orderBy: desc(ticketMailOutbox.sequence),
    columns: { sequence: true },
  });
  return (latest?.sequence ?? 0) + 1;
}

export async function enqueueTicketMail(input: {
  teamId: string;
  ticketDbId: string;
  sequence?: number;
  kind: "receipt" | "reply";
  payload: Record<string, unknown>;
  nextAttemptAt?: Date;
}) {
  const sequence = input.sequence ?? (await nextTicketMailSequence(input.ticketDbId));
  try {
    await db.insert(ticketMailOutbox).values({
      teamId: input.teamId,
      ticketId: input.ticketDbId,
      sequence,
      kind: input.kind,
      payload: input.payload,
      ...(input.nextAttemptAt ? { nextAttemptAt: input.nextAttemptAt } : {}),
    });
  } catch {
    // Unique (ticket, sequence) — retries are idempotent.
  }
}

/** How long a chat reply waits before it's emailed: if the requester reads
 * it in the chat by then, no email is sent (docs/embedded-support.md §6.7). */
export const REPLY_EMAIL_DELAY_MS = 2 * 60_000;

/**
 * A teammate or the AI answered a chat whose requester has an email address:
 * email the reply in a couple of minutes unless they've read it by then. One
 * waiting email per ticket covers a burst of replies.
 */
export async function scheduleReplyEmail(teamId: string, ticketDbId: string) {
  const waiting = await db.query.ticketMailOutbox.findMany({
    where: and(
      eq(ticketMailOutbox.ticketId, ticketDbId),
      eq(ticketMailOutbox.status, "pending"),
      eq(ticketMailOutbox.kind, "reply"),
    ),
  });
  if (waiting.some((row) => row.payload.digest === true)) return;
  await enqueueTicketMail({
    teamId,
    ticketDbId,
    kind: "reply",
    payload: { digest: true },
    nextAttemptAt: new Date(Date.now() + REPLY_EMAIL_DELAY_MS),
  });
}

export async function claimNextTicketMail() {
  const due = await db.query.ticketMailOutbox.findMany({
    where: and(
      eq(ticketMailOutbox.status, "pending"),
      lte(ticketMailOutbox.nextAttemptAt, new Date()),
    ),
    orderBy: asc(ticketMailOutbox.nextAttemptAt),
    limit: 20,
  });
  // A ticket's mails go out in order. Skip one whose predecessor is still on
  // its way, rather than holding up every other ticket's mail behind it.
  let job: (typeof due)[number] | undefined;
  for (const candidate of due) {
    if (candidate.sequence > 1) {
      const prior = await db.query.ticketMailOutbox.findFirst({
        where: and(
          eq(ticketMailOutbox.ticketId, candidate.ticketId),
          eq(ticketMailOutbox.sequence, candidate.sequence - 1),
        ),
      });
      if (prior && (prior.status === "pending" || prior.status === "sending")) continue;
    }
    job = candidate;
    break;
  }
  if (!job) return null;

  const [claimed] = await db
    .update(ticketMailOutbox)
    .set({ status: "sending", updatedAt: new Date() })
    .where(and(eq(ticketMailOutbox.id, job.id), eq(ticketMailOutbox.status, "pending")))
    .returning();
  return claimed ?? null;
}

export async function processTicketMailJob(job: typeof ticketMailOutbox.$inferSelect) {
  const ticket = await db.query.tickets.findFirst({
    where: eq(tickets.id, job.ticketId),
  });
  if (!ticket?.requesterEmail) {
    await db
      .update(ticketMailOutbox)
      .set({ status: "sent", updatedAt: new Date() })
      .where(eq(ticketMailOutbox.id, job.id));
    return;
  }

  if (job.payload.digest === true) {
    const payload = await sendUnreadReplies({
      ...ticket,
      requesterEmail: ticket.requesterEmail,
    });
    await db
      .update(ticketMailOutbox)
      .set({ status: "sent", payload, updatedAt: new Date() })
      .where(eq(ticketMailOutbox.id, job.id));
    return;
  }

  const token = String(job.payload.token ?? "");
  if (!token) throw new Error("ticket_mail_missing_token");

  if (job.kind === "receipt") {
    await notifyRequesterOfTicketCreated({
      teamId: ticket.teamId,
      ticketId: ticket.ticketId,
      token,
      requesterEmail: ticket.requesterEmail,
      subject: ticket.subject,
    });
  } else {
    const evidence = Array.isArray(job.payload.sources)
      ? (job.payload.sources as {
          documentId: string;
          kind?: string;
          revisionId?: string;
          publicationId?: string | null;
          evidenceId?: string;
          url?: string;
        }[])
      : [];
    if (!(await documentationEvidenceAllowed(ticket.teamId, evidence))) {
      // Consume this sequence without sending stale evidence or retaining
      // the queued answer. Later, unrelated replies can still proceed.
      await db
        .update(ticketMailOutbox)
        .set({
          status: "sent",
          payload: { withheld: "documentation_changed" },
          lastError: "documentation_changed",
          updatedAt: new Date(),
        })
        .where(eq(ticketMailOutbox.id, job.id));
      return;
    }
    await notifyRequesterOfReply({
      teamId: ticket.teamId,
      ticketId: ticket.ticketId,
      token,
      requesterEmail: ticket.requesterEmail,
      subject: ticket.subject,
      replyText: String(job.payload.replyText ?? ""),
      sources: Array.isArray(job.payload.sources)
        ? (job.payload.sources as {
            slug: string;
            title: string | null;
            anchor?: string | null;
          }[])
        : [],
    });
  }

  await db
    .update(ticketMailOutbox)
    .set({ status: "sent", updatedAt: new Date() })
    .where(eq(ticketMailOutbox.id, job.id));
}

/**
 * Emails the replies the requester hasn't read: those after they last had
 * the chat open, and after what an earlier reply email already covered.
 * Returns the payload to keep on the outbox row.
 */
async function sendUnreadReplies(
  ticket: typeof tickets.$inferSelect & { requesterEmail: string },
): Promise<Record<string, unknown>> {
  const messages = await db.query.ticketMessages.findMany({
    where: eq(ticketMessages.ticketId, ticket.id),
    orderBy: asc(ticketMessages.createdAt),
  });
  const sent = await db.query.ticketMailOutbox.findMany({
    where: and(
      eq(ticketMailOutbox.ticketId, ticket.id),
      eq(ticketMailOutbox.status, "sent"),
    ),
  });
  const covered = sent
    .map((row) => row.payload.coveredUntil)
    .filter((value): value is string => typeof value === "string")
    .map((value) => Date.parse(value));
  let since = Math.max(ticket.requesterLastReadAt?.getTime() ?? 0, ...covered);
  if (!ticket.requesterLastReadAt && covered.length === 0) {
    // Never read: count what came after their last message, like the widget.
    const lastOwn = [...messages]
      .reverse()
      .find((message) => message.author === "requester");
    since = lastOwn ? lastOwn.createdAt.getTime() : 0;
  }
  const unread = messages.filter(
    (message) =>
      (message.author === "agent" || message.author === "bot") &&
      message.createdAt.getTime() > since,
  );
  if (unread.length === 0) return { digest: true, skipped: "read" };

  const assistantName = (await getChatbotSettings(ticket.teamId)).name || "Assistant";
  await notifyRequesterOfReplies({
    teamId: ticket.teamId,
    ticketId: ticket.ticketId,
    token: await mintAccessGrant(ticket.teamId, ticket.id),
    requesterEmail: ticket.requesterEmail,
    subject: ticket.subject,
    replies: unread.map((message) => ({
      from: message.author === "bot" ? assistantName : "Support",
      text: ticketMessagePlainText(message.content),
      sources: (message.sources ?? []) as TicketMailSource[],
    })),
  });
  return {
    digest: true,
    replies: unread.length,
    coveredUntil: unread[unread.length - 1].createdAt.toISOString(),
  };
}

function ticketMessagePlainText(content: unknown): string {
  // Paragraphs become blank-line-separated text, like the inbox shows them.
  if (!content || typeof content !== "object") return "";
  const node = content as { type?: string; text?: unknown; content?: unknown };
  if (typeof node.text === "string") return node.text;
  const children = Array.isArray(node.content) ? node.content : [];
  const joiner = node.type === "doc" ? "\n\n" : "";
  return children.map(ticketMessagePlainText).join(joiner);
}

export async function failTicketMailJob(
  job: typeof ticketMailOutbox.$inferSelect,
  error: string,
) {
  const attempts = job.attempts + 1;
  const retry = attempts < 8;
  await db
    .update(ticketMailOutbox)
    .set({
      status: retry ? "pending" : "failed",
      attempts,
      lastError: error.slice(0, 500),
      nextAttemptAt: new Date(Date.now() + Math.min(1000 * 2 ** attempts, 3_600_000)),
      updatedAt: new Date(),
    })
    .where(eq(ticketMailOutbox.id, job.id));
  incrementCounter("inbox_ai_mail_failures_total", {
    kind: job.kind,
    exhausted: retry ? "false" : "true",
  });
  logger.warn({ jobId: job.id, error }, "Ticket mail job failed");
}
