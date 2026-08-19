import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db/client";
import { ticketAccessGrants } from "../db/schema";
import { generateTicketToken, verifyTicketToken } from "../tickets/token";
import { GRANT_TTL_MS } from "./config";
import type { DbExecutor } from "../db/transaction";

export async function mintAccessGrant(
    teamId: string,
    ticketDbId: string,
    executor: DbExecutor = db,
): Promise<string> {
    const { token, tokenHash } = generateTicketToken();
    await executor.insert(ticketAccessGrants).values({
        teamId,
        ticketId: ticketDbId,
        tokenHash,
        expiresAt: new Date(Date.now() + GRANT_TTL_MS),
    });
    return token;
}

export async function verifyTicketAccessToken(
    ticket: { id: string; teamId: string; accessTokenHash: string },
    token: string,
): Promise<boolean> {
    const grants = await db.query.ticketAccessGrants.findMany({
        where: and(
            eq(ticketAccessGrants.ticketId, ticket.id),
            eq(ticketAccessGrants.teamId, ticket.teamId),
            isNull(ticketAccessGrants.revokedAt),
        ),
    });
    const now = Date.now();
    for (const grant of grants) {
        if (grant.expiresAt.getTime() < now) continue;
        if (verifyTicketToken(token, grant.tokenHash)) return true;
    }
    return verifyTicketToken(token, ticket.accessTokenHash);
}

export async function revokeTicketAccessGrants(ticketDbId: string) {
    await db
        .update(ticketAccessGrants)
        .set({ revokedAt: new Date() })
        .where(
            and(
                eq(ticketAccessGrants.ticketId, ticketDbId),
                isNull(ticketAccessGrants.revokedAt),
            ),
        );
}

/** Keeps the first grant in sync with the ticket row so older links work. */
export async function seedLegacyGrant(
    teamId: string,
    ticketDbId: string,
    tokenHash: string,
    executor: DbExecutor = db,
) {
    await executor.insert(ticketAccessGrants).values({
        teamId,
        ticketId: ticketDbId,
        tokenHash,
        expiresAt: new Date(Date.now() + GRANT_TTL_MS),
    });
}

export async function hasAnyGrant(ticketDbId: string): Promise<boolean> {
    const grant = await db.query.ticketAccessGrants.findFirst({
        where: eq(ticketAccessGrants.ticketId, ticketDbId),
    });
    return Boolean(grant);
}
