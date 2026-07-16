import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { accounts, authUser, teamMembers, teams } from "../db/schema";
import { createApiKey } from "../apikey/queries";
import { provisionSendlitForTeam } from "../newsletter/provisioning";
import { provisionSubdomain } from "../domains/queries";
import { seedStandardPages } from "../pages/seed";

export async function findAccountByAuthUserId(authUserId: string) {
    return db.query.accounts.findFirst({ where: eq(accounts.authUserId, authUserId) });
}

export async function findAccountByEmail(email: string) {
    return db.query.accounts.findFirst({ where: eq(accounts.email, email) });
}

/** Creates (or returns) an account by email without a linked Better Auth
 * user — used by provisioning, before the tenant's owner has ever logged in. */
export async function findOrCreateBareAccount(email: string) {
    const existing = await findAccountByEmail(email);
    if (existing) return existing;

    const [account] = await db.insert(accounts).values({ email }).returning();
    return account;
}

/** Links a bare (provisioned) account to its Better Auth user on first real
 * login, or creates a fresh account for a brand-new signup. Called from
 * `databaseHooks.user.create.after`. */
export async function ensureAccountForAuthUser(authUserId: string, email: string) {
    const existing = await findAccountByEmail(email);
    if (existing) {
        if (!existing.authUserId) {
            const [updated] = await db
                .update(accounts)
                .set({ authUserId, updatedAt: new Date() })
                .where(eq(accounts.id, existing.id))
                .returning();
            return updated;
        }
        return existing;
    }

    const [account] = await db.insert(accounts).values({ authUserId, email }).returning();
    return account;
}

/** Resolves a bearer token's `sub` claim (a Better Auth user id) to the
 * domain account, looking up the auth user's email first. Used by
 * `resolve-auth.ts`'s OAuth bearer-token branch. */
export async function ensureAccountForAuthUserId(authUserId: string) {
    const user = await db.query.authUser.findFirst({ where: eq(authUser.id, authUserId) });
    if (!user) return null;
    return ensureAccountForAuthUser(authUserId, user.email);
}

export async function listTeamsForAccount(accountId: string) {
    const rows = await db
        .select({ team: teams })
        .from(teamMembers)
        .innerJoin(teams, eq(teamMembers.teamId, teams.id))
        .where(eq(teamMembers.accountId, accountId));
    return rows.map((row) => row.team);
}

export async function getTeamMembership(teamId: string, accountId: string) {
    return db.query.teamMembers.findFirst({
        where: and(eq(teamMembers.teamId, teamId), eq(teamMembers.accountId, accountId)),
    });
}

export async function isTeamMember(teamId: string, accountId: string) {
    return Boolean(await getTeamMembership(teamId, accountId));
}

export async function findTeamByPublicId(teamId: string) {
    return db.query.teams.findFirst({ where: eq(teams.teamId, teamId) });
}

export async function findTeamById(id: string) {
    return db.query.teams.findFirst({ where: eq(teams.id, id) });
}

export async function renameTeam(teamId: string, name: string) {
    const [team] = await db
        .update(teams)
        .set({ name, updatedAt: new Date() })
        .where(eq(teams.id, teamId))
        .returning();
    return team;
}

export async function deleteTeam(teamId: string) {
    await db.delete(teams).where(eq(teams.id, teamId));
}

export async function findTeamByExternalId(externalId: string) {
    return db.query.teams.findFirst({ where: eq(teams.externalId, externalId) });
}

export async function createTeam(input: {
    ownerAccountId: string;
    name: string;
    externalId?: string;
    ownerEmail?: string;
}) {
    const [team] = await db
        .insert(teams)
        .values({ ownerAccountId: input.ownerAccountId, name: input.name, externalId: input.externalId })
        .returning();

    await db.insert(teamMembers).values({ teamId: team.id, accountId: input.ownerAccountId, role: "owner" });

    // Every team gets its default `<slug>.<DOMAIN>` host and its standard
    // pages immediately (architecture.md §12.1, §4.2) — never lazy/optional.
    await provisionSubdomain(team.id, team.name);
    await seedStandardPages(team.id);

    // Every FrontLit team gets its own SendLit team, 1:1 (architecture.md
    // §10.1). Best-effort + non-blocking: never lets a SendLit outage fail
    // team creation, and falls back to an owner-email lookup if the caller
    // didn't already have one handy.
    const ownerEmail = input.ownerEmail ?? (await db.query.accounts.findFirst({ where: eq(accounts.id, input.ownerAccountId) }))?.email;
    if (ownerEmail) {
        await provisionSendlitForTeam(team, ownerEmail);
    }

    return team;
}

/** Idempotent find-or-create used by the provisioning endpoint: repeat
 * calls with the same `externalId` return the same team without duplicating
 * it or re-issuing an API key. */
export async function findOrCreateTeamByExternalId(input: {
    externalId: string;
    ownerEmail: string;
    name: string;
}) {
    const existing = await findTeamByExternalId(input.externalId);
    if (existing) return { team: existing, created: false, apiKeySecret: undefined as string | undefined };

    const account = await findOrCreateBareAccount(input.ownerEmail);
    const team = await createTeam({ ownerAccountId: account.id, name: input.name, externalId: input.externalId, ownerEmail: input.ownerEmail });
    const { secret } = await createApiKey(team.id, "Provisioning key");

    return { team, created: true, apiKeySecret: secret };
}
