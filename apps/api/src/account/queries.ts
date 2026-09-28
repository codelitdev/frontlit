import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { accounts, authUser, teams } from "../db/schema";
import { createTeam } from "../team/queries";

export type Account = typeof accounts.$inferSelect;

export async function getAccount(id: string): Promise<Account | null> {
  const [account] = await db
    .select()
    .from(accounts)
    .where(eq(accounts.id, id))
    .limit(1);
  return account ?? null;
}

export async function findAccountByEmail(email: string): Promise<Account | null> {
  const [account] = await db
    .select()
    .from(accounts)
    .where(eq(accounts.email, email.toLowerCase()))
    .limit(1);
  return account ?? null;
}

/** Creates the product identity behind a Better Auth user. Accounts may have
 * zero teams while onboarding or before accepting an invitation. */
export async function createAccount(
  email: string,
  options: { authUserId?: string } = {},
): Promise<Account> {
  const [account] = await db
    .insert(accounts)
    .values({
      email: email.toLowerCase(),
      authUserId: options.authUserId,
    })
    .returning();

  return account;
}

/** Explicit bootstrap convenience for deployments that need an initial team
 * and API key. Ordinary sign-up and invitation flows must not call this. */
export async function createAccountWithDefaultTeam(
  email: string,
  name?: string,
  options: { authUserId?: string; withDefaultApiKey?: boolean } = {},
): Promise<Account & { defaultTeamId: string; defaultApiKeySecret?: string }> {
  const account = await createAccount(email, {
    authUserId: options.authUserId,
  });

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
 * accounts created by provisioning are linked on first sign-in. This does not
 * create a team: team creation and invitation acceptance are explicit flows. */
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

    return account;
  }

  return createAccount(user.email, {
    authUserId: user.id,
  });
}

export async function deleteAccount(accountId: string): Promise<void> {
  const owned = await db.query.teams.findFirst({
    where: eq(teams.ownerAccountId, accountId),
  });
  if (owned) {
    const { MembershipError } = await import("../team/membership.js");
    throw new MembershipError(
      "owns_teams",
      "Transfer or delete owned teams before deleting this account",
    );
  }
  await db.delete(accounts).where(eq(accounts.id, accountId));
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
