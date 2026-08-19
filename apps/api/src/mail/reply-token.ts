import { and, eq, gt } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { db } from "../db/client";
import { emailReplyTokens, tickets } from "../db/schema";

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function generateReplyToken() {
    return randomBytes(20).toString("base64url");
}

export async function mintReplyToken(input: {
    teamId: string;
    ticketPublicId: string;
    requesterEmail: string;
}): Promise<string | null> {
    const ticket = await db.query.tickets.findFirst({
        where: and(
            eq(tickets.ticketId, input.ticketPublicId),
            eq(tickets.teamId, input.teamId),
        ),
    });
    if (!ticket) return null;

    const email = input.requesterEmail.trim().toLowerCase();
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
    const existing = await db.query.emailReplyTokens.findFirst({
        where: and(
            eq(emailReplyTokens.teamId, input.teamId),
            eq(emailReplyTokens.ticketId, ticket.id),
            eq(emailReplyTokens.requesterEmail, email),
        ),
    });
    if (existing) {
        await db
            .update(emailReplyTokens)
            .set({ expiresAt })
            .where(eq(emailReplyTokens.id, existing.id));
        return existing.token;
    }

    const [created] = await db
        .insert(emailReplyTokens)
        .values({
            token: generateReplyToken(),
            teamId: input.teamId,
            ticketId: ticket.id,
            requesterEmail: email,
            expiresAt,
        })
        .returning();
    return created.token;
}

export async function lookupReplyToken(token: string): Promise<{
    teamId: string;
    ticketPublicId: string;
    ticketDbId: string;
    requesterEmail: string;
} | null> {
    const row = await db.query.emailReplyTokens.findFirst({
        where: and(
            eq(emailReplyTokens.token, token),
            gt(emailReplyTokens.expiresAt, new Date()),
        ),
    });
    if (!row) return null;
    const ticket = await db.query.tickets.findFirst({
        where: eq(tickets.id, row.ticketId),
    });
    if (!ticket) return null;
    return {
        teamId: row.teamId,
        ticketPublicId: ticket.ticketId,
        ticketDbId: ticket.id,
        requesterEmail: row.requesterEmail,
    };
}
