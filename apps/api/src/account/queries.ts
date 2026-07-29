import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { accounts, authUser } from "../db/schema";
import { createTeam, listTeamsForAccount } from "../team/queries";

export type Account = typeof accounts.$inferSelect;

export async function getAccount(id: string): Promise<Account | null> {
    const [account] = await db
        .select()
        .from(accounts)
        .where(eq(accounts.id, id))
        .limit(1);
    return account ?? null;
}

export async function findAccountByEmail(
    email: string,
): Promise<Account | null> {
    const [account] = await db
        .select()
        .from(accounts)
        .where(eq(accounts.email, email.toLowerCase()))
        .limit(1);
    return account ?? null;
}

/**
 * Creates the product account behind a Better Auth identity and gives it a
 * default team immediately. The team is the tenant boundary for every
 * FrontLit object, so a signed-in account must never be left with nowhere to
 * put its pages, documents, settings, or integrations.
 */
export async function createAccount(
    email: string,
    name?: string,
    options: { authUserId?: string; withDefaultApiKey?: boolean } = {},
): Promise<Account & { defaultTeamId: string; defaultApiKeySecret?: string }> {
    const [account] = await db
        .insert(accounts)
        .values({
            email: email.toLowerCase(),
            authUserId: options.authUserId,
        })
        .returning();

    const team = await createTeam({
        ownerAccountId: account.id,
        ownerEmail: account.email,
        name: name ? `${name}'s Team` : "My Team",
        withDefaultApiKey: options.withDefaultApiKey,
    });

    return {
        ...account,
        defaultTeamId: team.id,
        defaultApiKeySecret: team.defaultApiKeySecret,
    };
}

/** Resolve or create the FrontLit account for a Better Auth user. Bare
 * accounts created by provisioning are linked on first sign-in. */
export async function ensureFrontLitAccountForUser(user: {
    id?: string;
    email: string;
    name?: string | null;
}): Promise<Account> {
    const existing = await findAccountByEmail(user.email);
    if (existing) {
        let account = existing;
        if (user.id && !existing.authUserId) {
            const [linked] = await db
                .update(accounts)
                .set({ authUserId: user.id, updatedAt: new Date() })
                .where(eq(accounts.id, existing.id))
                .returning();
            account = linked;
        }

        // Backfill accounts created by older FrontLit auth flows, which
        // inserted an account row but did not provision its default team.
        if ((await listTeamsForAccount(account.id)).length === 0) {
            await createTeam({
                ownerAccountId: account.id,
                ownerEmail: account.email,
                name: user.name ? `${user.name}'s Team` : "My Team",
            });
        }
        return account;
    }

    return createAccount(user.email, user.name || undefined, {
        authUserId: user.id,
    });
}

export async function ensureFrontLitAccountForBetterAuthUserId(
    userId: string,
): Promise<Account | null> {
    const [user] = await db
        .select()
        .from(authUser)
        .where(eq(authUser.id, userId))
        .limit(1);
    if (!user) return null;

    return ensureFrontLitAccountForUser({
        id: user.id,
        email: user.email,
        name: user.name,
    });
}
