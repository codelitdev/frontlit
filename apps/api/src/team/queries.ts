import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import {
    accounts,
    oauthPostLoginTeamSelections,
    teamMembers,
    teams,
} from "../db/schema";
import { createApiKey } from "../apikey/queries";
import { provisionSendlitForTeam } from "../newsletter/provisioning";
import { seedStandardPages } from "../pages/seed";
import { deleteTeamMediaFiles } from "../media/queries";

export type Team = typeof teams.$inferSelect;
export type TeamMember = typeof teamMembers.$inferSelect;
export type CreatedTeam = Team & { defaultApiKeySecret?: string };

/** Creates (or returns) an account by email without a linked Better Auth
 * user — used by provisioning, before the tenant's owner has ever logged in. */
export async function findOrCreateBareAccount(email: string) {
    const normalized = email.toLowerCase();
    const existing = await db.query.accounts.findFirst({
        where: eq(accounts.email, normalized),
    });
    if (existing) return existing;

    const [account] = await db
        .insert(accounts)
        .values({ email: normalized })
        .returning();
    return account;
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

export const getTeamByTeamId = findTeamByPublicId;

export async function findTeamById(id: string) {
    return db.query.teams.findFirst({ where: eq(teams.id, id) });
}

export const getTeam = findTeamById;

export async function renameTeam(teamId: string, name: string) {
    const [team] = await db
        .update(teams)
        .set({ name, updatedAt: new Date() })
        .where(eq(teams.id, teamId))
        .returning();
    return team;
}

export async function deleteTeam(teamId: string) {
    await deleteTeamMediaFiles(teamId);
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
    withDefaultApiKey?: boolean;
}): Promise<CreatedTeam> {
    const [team] = await db
        .insert(teams)
        .values({
            ownerAccountId: input.ownerAccountId,
            name: input.name,
            externalId: input.externalId,
        })
        .returning();

    await db.insert(teamMembers).values({ teamId: team.id, accountId: input.ownerAccountId, role: "owner" });

    // Standard pages are provisioned immediately. The public website remains
    // inactive until a member deliberately claims its subdomain in settings.
    await seedStandardPages(team.id);

    // Every FrontLit team gets its own SendLit team, 1:1 (architecture.md
    // §10.1). Best-effort + non-blocking: never lets a SendLit outage fail
    // team creation, and falls back to an owner-email lookup if the caller
    // didn't already have one handy.
    const ownerEmail = input.ownerEmail ?? (await db.query.accounts.findFirst({ where: eq(accounts.id, input.ownerAccountId) }))?.email;
    if (ownerEmail) {
        await provisionSendlitForTeam(team, ownerEmail);
    }

    if (!input.withDefaultApiKey) return team;

    const { secret } = await createApiKey(team.id, "Default");
    return { ...team, defaultApiKeySecret: secret };
}

/** Idempotent find-or-create used by the provisioning endpoint: repeat
 * calls with the same `externalId` return the same team without duplicating
 * it or re-issuing an API key. */
export async function findOrCreateTeamByExternalId(input: {
    externalId: string;
    ownerAccountId: string;
    name: string;
    ownerEmail?: string;
}): Promise<CreatedTeam> {
    const existing = await findTeamByExternalId(input.externalId);
    if (existing) return existing;

    return createTeam({
        ownerAccountId: input.ownerAccountId,
        name: input.name,
        externalId: input.externalId,
        ownerEmail: input.ownerEmail,
        withDefaultApiKey: true,
    });
}

export async function setOAuthTeamSelection(
    sessionId: string,
    teamId: string,
): Promise<void> {
    await db
        .insert(oauthPostLoginTeamSelections)
        .values({ sessionId, teamId })
        .onConflictDoUpdate({
            target: oauthPostLoginTeamSelections.sessionId,
            set: { teamId, updatedAt: new Date() },
        });
}

export async function getOAuthTeamSelection(
    sessionId: string,
): Promise<string | null> {
    const [selection] = await db
        .select({ teamId: oauthPostLoginTeamSelections.teamId })
        .from(oauthPostLoginTeamSelections)
        .where(eq(oauthPostLoginTeamSelections.sessionId, sessionId))
        .limit(1);
    return selection?.teamId ?? null;
}
