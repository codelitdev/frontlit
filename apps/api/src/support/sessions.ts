import { and, desc, eq, gt, inArray } from "drizzle-orm";
import { db } from "../db/client";
import { supportSessions, tickets, type RequesterAccount } from "../db/schema";
import { getEmbedOrigin } from "../domains/queries";
import { mintAccessGrant } from "../inbox-ai/grants";
import { generateTicketToken, hashTicketToken } from "../tickets/token";

/**
 * In-app support sessions (docs/embedded-support.md §6.2). The host app's
 * server mints one when a signed-in user asks for help, so identity and
 * context come from the host, never from the browser. Minting creates no
 * ticket; the first message does (see the public chat route).
 */

export const SESSION_TTL_MS = 60 * 60 * 1000;
/** Context is free-form JSON from the host app; capped so it stays a
 * small incident note (§6.5). */
export const CONTEXT_MAX_BYTES = 8 * 1024;

export type SupportSession = typeof supportSessions.$inferSelect;

export type CreateSupportSessionInput = {
  contact: { email: string; name?: string; externalId?: string };
  account?: RequesterAccount;
  context?: Record<string, unknown>;
  message?: string;
};

export class ContextTooLargeError extends Error {
  constructor() {
    super(`context must be at most ${CONTEXT_MAX_BYTES} bytes of JSON`);
  }
}

export async function createSupportSession(
  team: { id: string; teamId: string },
  input: CreateSupportSessionInput,
) {
  const context =
    input.context && Object.keys(input.context).length ? input.context : null;
  if (context && Buffer.byteLength(JSON.stringify(context)) > CONTEXT_MAX_BYTES) {
    throw new ContextTooLargeError();
  }
  const { token, tokenHash } = generateTicketToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(supportSessions).values({
    teamId: team.id,
    tokenHash,
    requesterEmail: input.contact.email.trim().toLowerCase(),
    requesterName: input.contact.name?.trim() || null,
    requesterExternalId: input.contact.externalId?.trim() || null,
    requesterAccount: input.account ?? null,
    context,
    message: input.message?.trim() || null,
    expiresAt,
  });
  return {
    token,
    // The same chat as a standalone page, for hosts that don't embed the
    // widget. The token rides in the fragment, out of server logs.
    url: `${getEmbedOrigin()}/${team.teamId}/chat#token=${token}`,
    expiresAt: expiresAt.toISOString(),
  };
}

/** The unexpired session for this team and token, or null. */
export async function findSupportSession(teamId: string, token: string) {
  if (!token) return null;
  const session = await db.query.supportSessions.findFirst({
    where: and(
      eq(supportSessions.tokenHash, hashTicketToken(token)),
      eq(supportSessions.teamId, teamId),
      gt(supportSessions.expiresAt, new Date()),
    ),
  });
  return session ?? null;
}

/** The requester's latest unresolved chat, matched by the host app's user
 * ID when there is one, otherwise by email. */
export async function findOpenSessionTicket(session: SupportSession) {
  const requester = session.requesterExternalId
    ? eq(tickets.requesterExternalId, session.requesterExternalId)
    : eq(tickets.requesterEmail, session.requesterEmail);
  return db.query.tickets.findFirst({
    where: and(
      eq(tickets.teamId, session.teamId),
      eq(tickets.source, "chatbot"),
      inArray(tickets.status, ["open", "pending"]),
      requester,
    ),
    orderBy: desc(tickets.lastMessageAt),
  });
}

/** Ticket fields that come from the session (§6.4–6.5). */
export function sessionTicketFields(session: SupportSession) {
  return {
    requesterEmail: session.requesterEmail,
    requesterName: session.requesterName ?? undefined,
    requesterExternalId: session.requesterExternalId,
    requesterAccount: session.requesterAccount,
    context: session.context,
  };
}

/** Points an existing ticket at the latest incident: the new session's
 * context replaces the old one. */
export async function refreshTicketContext(
  ticketDbId: string,
  session: SupportSession,
) {
  if (!session.context) return;
  await db
    .update(tickets)
    .set({ context: session.context, updatedAt: new Date() })
    .where(eq(tickets.id, ticketDbId));
}

/**
 * What the widget needs when it opens with a session: the requester's open
 * chat with a fresh access grant, or nothing (a blank chat with the
 * prefilled message). Null when the session is missing or expired.
 */
export async function openSupportSession(teamId: string, token: string) {
  const session = await findSupportSession(teamId, token);
  if (!session) return null;
  const ticket = await findOpenSessionTicket(session);
  let open: { ticketId: string; accessToken: string } | null = null;
  if (ticket) {
    await refreshTicketContext(ticket.id, session);
    open = {
      ticketId: ticket.ticketId,
      accessToken: await mintAccessGrant(teamId, ticket.id),
    };
  }
  return {
    ticket: open,
    prefill: session.message,
    requester: { name: session.requesterName },
  };
}
