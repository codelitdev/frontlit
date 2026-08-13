import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import type { DbExecutor } from "../db/transaction";
import {
    accounts,
    authOAuthAccessToken,
    authOAuthConsent,
    authOAuthRefreshToken,
} from "../db/schema";

export async function revokeTeamBoundOAuthFamilies(input: {
    accountId: string;
    teamId: string;
    executor?: DbExecutor;
}): Promise<void> {
    const executor = input.executor ?? db;
    const account = await executor.query.accounts.findFirst({
        where: eq(accounts.id, input.accountId),
    });
    if (!account?.authUserId) return;

    await executor
        .update(authOAuthRefreshToken)
        .set({ revoked: new Date() })
        .where(
            and(
                eq(authOAuthRefreshToken.userId, account.authUserId),
                eq(authOAuthRefreshToken.referenceId, input.teamId),
            ),
        );

    await executor
        .delete(authOAuthConsent)
        .where(
            and(
                eq(authOAuthConsent.userId, account.authUserId),
                eq(authOAuthConsent.referenceId, input.teamId),
            ),
        );

    await executor
        .delete(authOAuthAccessToken)
        .where(
            and(
                eq(authOAuthAccessToken.userId, account.authUserId),
                eq(authOAuthAccessToken.referenceId, input.teamId),
            ),
        );
}

export async function revokeAllTeamOAuthFamilies(
    teamId: string,
    executor: DbExecutor = db,
): Promise<void> {
    await executor
        .update(authOAuthRefreshToken)
        .set({ revoked: new Date() })
        .where(eq(authOAuthRefreshToken.referenceId, teamId));
    await executor
        .delete(authOAuthConsent)
        .where(eq(authOAuthConsent.referenceId, teamId));
    await executor
        .delete(authOAuthAccessToken)
        .where(eq(authOAuthAccessToken.referenceId, teamId));
}
