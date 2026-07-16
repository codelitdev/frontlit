import { and, count, desc, eq, ilike, or } from "drizzle-orm";
import { db } from "../db/client";
import { accounts, teamMembers, ticketMessages, tickets, type TicketSource, type TicketStatus, type TextEditorContentRow } from "../db/schema";
import { generateTicketToken, hashTicketToken, verifyTicketToken } from "./token";

const TEXT_MESSAGE = (text: string): TextEditorContentRow => ({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});

export async function createTicket(input: {
    teamId: string;
    subject: string;
    message: string;
    requesterEmail: string;
    requesterName?: string;
    source: TicketSource;
}) {
    const { token, tokenHash } = generateTicketToken();

    const [ticket] = await db
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

    await db.insert(ticketMessages).values({
        teamId: input.teamId,
        ticketId: ticket.id,
        author: "requester",
        content: TEXT_MESSAGE(input.message),
    });

    return { ticket, token };
}

export async function listTickets(input: { teamId: string; status?: TicketStatus; assigneeAccountId?: string; q?: string; offset?: number; itemsPerPage?: number }) {
    const conditions = [eq(tickets.teamId, input.teamId)];
    if (input.status) conditions.push(eq(tickets.status, input.status));
    if (input.assigneeAccountId) conditions.push(eq(tickets.assigneeAccountId, input.assigneeAccountId));
    if (input.q) conditions.push(or(ilike(tickets.subject, `%${input.q}%`), ilike(tickets.requesterEmail, `%${input.q}%`))!);

    const offset = ((input.offset ?? 1) - 1) * (input.itemsPerPage ?? 20);
    const limit = input.itemsPerPage ?? 20;

    return db.query.tickets.findMany({
        where: and(...conditions),
        limit,
        offset,
        orderBy: desc(tickets.lastMessageAt),
    });
}

export async function countTickets(input: { teamId: string; status?: TicketStatus; assigneeAccountId?: string; q?: string }) {
    const conditions = [eq(tickets.teamId, input.teamId)];
    if (input.status) conditions.push(eq(tickets.status, input.status));
    if (input.assigneeAccountId) conditions.push(eq(tickets.assigneeAccountId, input.assigneeAccountId));
    if (input.q) conditions.push(or(ilike(tickets.subject, `%${input.q}%`), ilike(tickets.requesterEmail, `%${input.q}%`))!);

    const [{ value }] = await db.select({ value: count() }).from(tickets).where(and(...conditions));
    return value;
}

export async function getTicketByTicketId(teamId: string, ticketId: string) {
    return db.query.tickets.findFirst({ where: and(eq(tickets.ticketId, ticketId), eq(tickets.teamId, teamId)) });
}

export async function getTicketMessages(ticketDbId: string) {
    return db.query.ticketMessages.findMany({ where: eq(ticketMessages.ticketId, ticketDbId), orderBy: ticketMessages.createdAt });
}

export async function addTicketMessage(input: {
    teamId: string;
    ticketDbId: string;
    author: "requester" | "agent" | "bot";
    authorAccountId?: string;
    content: TextEditorContentRow;
}) {
    const [message] = await db
        .insert(ticketMessages)
        .values({
            teamId: input.teamId,
            ticketId: input.ticketDbId,
            author: input.author,
            authorAccountId: input.authorAccountId,
            content: input.content,
        })
        .returning();

    await db.update(tickets).set({ lastMessageAt: new Date(), updatedAt: new Date() }).where(eq(tickets.id, input.ticketDbId));

    return message;
}

export async function updateTicket(teamId: string, ticketId: string, patch: Partial<{ status: TicketStatus; assigneeAccountId: string | null }>) {
    const existing = await getTicketByTicketId(teamId, ticketId);
    if (!existing) return null;

    const [ticket] = await db
        .update(tickets)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(tickets.id, existing.id))
        .returning();
    return ticket;
}

/** Verifies a visitor-supplied magic-link token against the ticket's stored
 * hash (constant-time, architecture.md §13.4). */
export function verifyTicketAccess(ticket: { accessTokenHash: string }, token: string): boolean {
    return verifyTicketToken(token, ticket.accessTokenHash);
}

/** Rotates the ticket's access token — only the hash is ever persisted, so
 * a fresh plaintext token is minted every time we email the requester a
 * link ("every requester email re-sends a fresh link", architecture.md
 * §13.4). Invalidates any previously issued link. */
export async function reissueTicketAccessToken(ticketDbId: string): Promise<string> {
    const { token, tokenHash } = generateTicketToken();
    await db.update(tickets).set({ accessTokenHash: tokenHash, updatedAt: new Date() }).where(eq(tickets.id, ticketDbId));
    return token;
}

export { hashTicketToken };

/** Resolves who to notify for a ticket event: the assignee if set, else the
 * team's owner (architecture.md §11.2 — "assignee or team owner"). */
export async function getTicketNotificationRecipient(teamId: string, assigneeAccountId: string | null): Promise<string | null> {
    if (assigneeAccountId) {
        const account = await db.query.accounts.findFirst({ where: eq(accounts.id, assigneeAccountId) });
        if (account) return account.email;
    }

    const [row] = await db
        .select({ email: accounts.email })
        .from(teamMembers)
        .innerJoin(accounts, eq(teamMembers.accountId, accounts.id))
        .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.role, "owner")))
        .limit(1);
    return row?.email ?? null;
}
