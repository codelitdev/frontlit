import { and, asc, eq, gt, inArray, lte, sql } from "drizzle-orm";
import { isUniqueConstraintViolation } from "../utils/slug";
import {
    computeEffectivePermissions,
    evaluateInvitationDelegation,
    evaluateMembershipEdit,
    evaluateMembershipRemove,
    GRANTABLE_NON_OWNER_PERMISSIONS,
    normalizePermissionGrants,
    type AcceptedTeamMember,
    type TeamPermission,
} from "@frontlit/api-contract";
import { db } from "../db/client";
import {
    supportsRowLocks,
    withDbTransaction,
    type DbExecutor,
} from "../db/transaction";
import {
    accounts,
    authUser,
    teamInvitations,
    teamMembers,
    teams,
    tickets,
} from "../db/schema";
import { revokeTeamBoundOAuthFamilies } from "../auth/oauth-revocation";
import { deleteApiKey, getApiKeysByTeamId } from "../apikey/queries";
import { insertAuditEvent } from "./audit";
import {
    generateInvitationToken,
    hashInvitationToken,
    invitationTokensMatch,
    normalizeInvitationEmail,
} from "./invitation-token";
import {
    InvitationDeliveryError,
    sendInvitationEmail,
    type InvitationMailer,
} from "./invitation-email";
import { webClientUrl } from "../auth/better-auth";

export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export class MembershipError extends Error {
    constructor(
        public readonly code:
            | "not_found"
            | "conflict"
            | "forbidden"
            | "owner_required"
            | "stale_version"
            | "email_mismatch"
            | "delivery_failed"
            | "owns_teams",
        message: string,
        public readonly extras: Record<string, unknown> = {},
    ) {
        super(message);
        this.name = "MembershipError";
    }
}

type Tx = DbExecutor;

function decodeCursor(
    cursor: string | undefined,
): { createdAt: Date; id: string } | null {
    if (!cursor) return null;
    const [createdAt, id] = cursor.split("|");
    if (!createdAt || !id) return null;
    const date = new Date(createdAt);
    if (Number.isNaN(date.getTime())) return null;
    return { createdAt: date, id };
}

function encodeCursor(createdAt: Date, id: string): string {
    return `${createdAt.toISOString()}|${id}`;
}

async function lockTeam(tx: Tx, teamId: string) {
    const query = tx.select().from(teams).where(eq(teams.id, teamId));
    const [team] = supportsRowLocks(tx)
        ? await query.for("update")
        : await query;
    return team ?? null;
}

async function lockMembership(tx: Tx, teamId: string, accountId: string) {
    const query = tx
        .select()
        .from(teamMembers)
        .where(
            and(
                eq(teamMembers.teamId, teamId),
                eq(teamMembers.accountId, accountId),
            ),
        );
    const [row] = supportsRowLocks(tx)
        ? await query.for("update")
        : await query;
    return row ?? null;
}

function actorSnapshot(
    team: { ownerAccountId: string },
    membership: { accountId: string; permissions: string[] | null },
) {
    const isOwner = team.ownerAccountId === membership.accountId;
    return {
        isOwner,
        effective: computeEffectivePermissions(membership.permissions ?? [], {
            isOwner,
        }),
    };
}

async function displayNameForAccount(
    accountId: string | null | undefined,
    executor: DbExecutor = db,
) {
    if (!accountId) return null;
    const account = await executor.query.accounts.findFirst({
        where: eq(accounts.id, accountId),
    });
    if (!account?.authUserId) return null;
    const user = await executor.query.authUser.findFirst({
        where: eq(authUser.id, account.authUserId),
    });
    return user?.name ?? null;
}

export function toPublicMember(input: {
    member: typeof teamMembers.$inferSelect;
    email: string;
    name: string | null;
    ownerAccountId: string;
}) {
    const isOwner = input.member.accountId === input.ownerAccountId;
    const permissions = isOwner
        ? []
        : normalizePermissionGrants(input.member.permissions ?? []);
    return {
        memberId: input.member.memberId,
        email: input.email,
        name: input.name,
        isOwner,
        permissions,
        effectivePermissions: computeEffectivePermissions(permissions, {
            isOwner,
        }),
        version: input.member.version,
        createdAt: input.member.createdAt.toISOString(),
        updatedAt: input.member.updatedAt.toISOString(),
    };
}

export async function listTeamMembers(input: {
    teamId: string;
    ownerAccountId: string;
    viewerAccountId: string;
    cursor?: string;
    limit: number;
}) {
    const cursor = decodeCursor(input.cursor);
    const rows = await db
        .select({
            member: teamMembers,
            email: accounts.email,
            name: authUser.name,
        })
        .from(teamMembers)
        .innerJoin(accounts, eq(teamMembers.accountId, accounts.id))
        .leftJoin(authUser, eq(accounts.authUserId, authUser.id))
        .where(
            cursor
                ? and(
                      eq(teamMembers.teamId, input.teamId),
                      sql`(${teamMembers.createdAt}, ${teamMembers.id}) > (${cursor.createdAt}, ${cursor.id})`,
                  )
                : eq(teamMembers.teamId, input.teamId),
        )
        .orderBy(asc(teamMembers.createdAt), asc(teamMembers.id))
        .limit(input.limit + 1);

    const page = rows.slice(0, input.limit);
    const viewerRow =
        rows.find((row) => row.member.accountId === input.viewerAccountId) ??
        (
            await db
                .select({
                    member: teamMembers,
                    email: accounts.email,
                    name: authUser.name,
                })
                .from(teamMembers)
                .innerJoin(accounts, eq(teamMembers.accountId, accounts.id))
                .leftJoin(authUser, eq(accounts.authUserId, authUser.id))
                .where(
                    and(
                        eq(teamMembers.teamId, input.teamId),
                        eq(teamMembers.accountId, input.viewerAccountId),
                    ),
                )
                .limit(1)
        )[0];
    if (!viewerRow) {
        throw new MembershipError("forbidden", "not_a_team_member");
    }
    const last = page.at(-1);
    return {
        items: page.map((row) =>
            toPublicMember({
                member: row.member,
                email: row.email,
                name: row.name ?? null,
                ownerAccountId: input.ownerAccountId,
            }),
        ),
        viewer: toPublicMember({
            member: viewerRow.member,
            email: viewerRow.email,
            name: viewerRow.name ?? null,
            ownerAccountId: input.ownerAccountId,
        }),
        nextCursor:
            rows.length > input.limit && last
                ? encodeCursor(last.member.createdAt, last.member.id)
                : null,
    };
}

export async function listTeamInvitations(input: {
    teamId: string;
    cursor?: string;
    limit: number;
}) {
    await expirePendingInvitations({ teamId: input.teamId });
    const cursor = decodeCursor(input.cursor);
    const rows = await db
        .select({
            invitation: teamInvitations,
            inviterName: authUser.name,
        })
        .from(teamInvitations)
        .leftJoin(accounts, eq(teamInvitations.invitedByAccountId, accounts.id))
        .leftJoin(authUser, eq(accounts.authUserId, authUser.id))
        .where(
            cursor
                ? and(
                      eq(teamInvitations.teamId, input.teamId),
                      eq(teamInvitations.status, "pending"),
                      gt(teamInvitations.expiresAt, new Date()),
                      sql`(${teamInvitations.createdAt}, ${teamInvitations.id}) > (${cursor.createdAt}, ${cursor.id})`,
                  )
                : and(
                      eq(teamInvitations.teamId, input.teamId),
                      eq(teamInvitations.status, "pending"),
                      gt(teamInvitations.expiresAt, new Date()),
                  ),
        )
        .orderBy(asc(teamInvitations.createdAt), asc(teamInvitations.id))
        .limit(input.limit + 1);

    const page = rows.slice(0, input.limit);
    const last = page.at(-1);
    return {
        items: page.map((row) =>
            toPublicInvitation(row.invitation, row.inviterName ?? null),
        ),
        nextCursor:
            rows.length > input.limit && last
                ? encodeCursor(last.invitation.createdAt, last.invitation.id)
                : null,
    };
}

export function toPublicInvitation(
    invitation: typeof teamInvitations.$inferSelect,
    invitedByName: string | null,
) {
    const permissions = normalizePermissionGrants(invitation.permissions ?? []);
    return {
        invitationId: invitation.invitationId,
        email: invitation.email,
        permissions,
        effectivePermissions: computeEffectivePermissions(permissions),
        status: invitation.status,
        invitedByName,
        expiresAt: invitation.expiresAt.toISOString(),
        createdAt: invitation.createdAt.toISOString(),
        updatedAt: invitation.updatedAt.toISOString(),
    };
}

type ExpireInvitationFilter = {
    teamId?: string;
    email?: string;
    invitationId?: string;
    limit?: number;
};

async function expirePendingInvitationsInTx(
    tx: Tx,
    input: ExpireInvitationFilter = {},
): Promise<number> {
    const now = new Date();
    const conditions = [
        eq(teamInvitations.status, "pending"),
        lte(teamInvitations.expiresAt, now),
    ];
    if (input.teamId) conditions.push(eq(teamInvitations.teamId, input.teamId));
    if (input.email) conditions.push(eq(teamInvitations.email, input.email));
    if (input.invitationId) {
        conditions.push(eq(teamInvitations.invitationId, input.invitationId));
    }

    const candidates = await tx
        .select({
            id: teamInvitations.id,
            email: teamInvitations.email,
            teamPublicId: teams.teamId,
        })
        .from(teamInvitations)
        .innerJoin(teams, eq(teamInvitations.teamId, teams.id))
        .where(and(...conditions))
        .orderBy(asc(teamInvitations.expiresAt), asc(teamInvitations.id))
        .limit(Math.min(Math.max(input.limit ?? 500, 1), 500));
    if (candidates.length === 0) return 0;

    const updated = await tx
        .update(teamInvitations)
        .set({ status: "expired", updatedAt: now })
        .where(
            and(
                inArray(
                    teamInvitations.id,
                    candidates.map((candidate) => candidate.id),
                ),
                eq(teamInvitations.status, "pending"),
                lte(teamInvitations.expiresAt, now),
            ),
        )
        .returning({ id: teamInvitations.id });
    const expiredIds = new Set(updated.map((row) => row.id));
    for (const candidate of candidates) {
        if (!expiredIds.has(candidate.id)) continue;
        await insertAuditEvent(tx, {
            eventType: "invitation.expired",
            teamPublicId: candidate.teamPublicId,
            targetEmail: candidate.email,
        });
    }
    return updated.length;
}

export async function expirePendingInvitations(
    input: ExpireInvitationFilter = {},
): Promise<number> {
    return withDbTransaction((tx) => expirePendingInvitationsInTx(tx, input));
}

export async function updateMemberPermissions(input: {
    teamId: string;
    actorAccountId: string;
    memberId: string;
    permissions: readonly string[];
    version: number;
}) {
    const proposed = normalizePermissionGrants(input.permissions);
    const proposedEffective = computeEffectivePermissions(proposed);

    return withDbTransaction(async (tx) => {
        const team = await lockTeam(tx, input.teamId);
        if (!team) throw new MembershipError("not_found", "Team not found");
        const actor = await lockMembership(
            tx,
            input.teamId,
            input.actorAccountId,
        );
        if (!actor) throw new MembershipError("forbidden", "not_a_team_member");
        const [target] = await tx
            .select()
            .from(teamMembers)
            .where(
                and(
                    eq(teamMembers.teamId, input.teamId),
                    eq(teamMembers.memberId, input.memberId),
                ),
            );
        if (!target) throw new MembershipError("not_found", "Member not found");
        if (target.version !== input.version) {
            throw new MembershipError("stale_version", "Member was updated");
        }

        const actorView = actorSnapshot(team, actor);
        const targetIsOwner = target.accountId === team.ownerAccountId;
        const currentEffective = computeEffectivePermissions(
            target.permissions ?? [],
            {
                isOwner: targetIsOwner,
            },
        );
        const decision = evaluateMembershipEdit({
            actorAccountId: input.actorAccountId,
            actorIsOwner: actorView.isOwner,
            actorEffective: actorView.effective,
            targetAccountId: target.accountId,
            targetIsOwner,
            currentEffective,
            proposedEffective,
        });
        if (!decision.allowed) {
            throw new MembershipError("forbidden", decision.reason);
        }

        const [updated] = await tx
            .update(teamMembers)
            .set({
                permissions: [...proposed],
                version: target.version + 1,
                updatedAt: new Date(),
                role: "member",
            })
            .where(
                and(
                    eq(teamMembers.id, target.id),
                    eq(teamMembers.version, input.version),
                ),
            )
            .returning();
        if (!updated) {
            throw new MembershipError("stale_version", "Member was updated");
        }

        const account = await tx.query.accounts.findFirst({
            where: eq(accounts.id, updated.accountId),
        });
        await insertAuditEvent(tx, {
            eventType: "member.permissions_changed",
            teamPublicId: team.teamId,
            actorAccountId: input.actorAccountId,
            targetMemberId: updated.memberId,
            beforePermissions: currentEffective,
            afterPermissions: proposedEffective,
        });
        return toPublicMember({
            member: updated,
            email: account?.email ?? "",
            name: await displayNameForAccount(updated.accountId, tx),
            ownerAccountId: team.ownerAccountId,
        });
    });
}

export async function removeOrLeaveMember(input: {
    teamId: string;
    actorAccountId: string;
    memberId?: string;
    leave: boolean;
}) {
    return withDbTransaction(async (tx) => {
        const team = await lockTeam(tx, input.teamId);
        if (!team) throw new MembershipError("not_found", "Team not found");
        const actor = await lockMembership(
            tx,
            input.teamId,
            input.actorAccountId,
        );
        if (!actor) throw new MembershipError("forbidden", "not_a_team_member");

        const target = input.leave
            ? actor
            : (
                  await tx
                      .select()
                      .from(teamMembers)
                      .where(
                          and(
                              eq(teamMembers.teamId, input.teamId),
                              eq(teamMembers.memberId, input.memberId ?? ""),
                          ),
                      )
              )[0];
        if (!target) throw new MembershipError("not_found", "Member not found");

        const actorView = actorSnapshot(team, actor);
        const targetIsOwner = target.accountId === team.ownerAccountId;
        const targetEffective = computeEffectivePermissions(
            target.permissions ?? [],
            {
                isOwner: targetIsOwner,
            },
        );
        if (input.leave && targetIsOwner) {
            throw new MembershipError("forbidden", "owner_target");
        }
        const decision = evaluateMembershipRemove({
            actorAccountId: input.actorAccountId,
            actorIsOwner: actorView.isOwner,
            actorEffective: actorView.effective,
            targetAccountId: target.accountId,
            targetIsOwner,
            targetEffective,
        });
        if (!decision.allowed) {
            throw new MembershipError("forbidden", decision.reason);
        }

        await tx.delete(teamMembers).where(eq(teamMembers.id, target.id));
        await tx
            .update(tickets)
            .set({ assigneeAccountId: null, updatedAt: new Date() })
            .where(
                and(
                    eq(tickets.teamId, input.teamId),
                    eq(tickets.assigneeAccountId, target.accountId),
                ),
            );
        await insertAuditEvent(tx, {
            eventType: input.leave ? "member.left" : "member.removed",
            teamPublicId: team.teamId,
            actorAccountId: input.actorAccountId,
            targetMemberId: target.memberId,
            beforePermissions: targetEffective,
        });

        await revokeTeamBoundOAuthFamilies({
            accountId: target.accountId,
            teamId: input.teamId,
            executor: tx,
        });
        return { teamPublicId: team.teamId };
    });
}

export async function transferOwnership(input: {
    teamId: string;
    actorAccountId: string;
    memberId: string;
    revokeApiKeys?: boolean;
}) {
    return withDbTransaction(async (tx) => {
        const team = await lockTeam(tx, input.teamId);
        if (!team) throw new MembershipError("not_found", "Team not found");
        if (team.ownerAccountId !== input.actorAccountId) {
            throw new MembershipError(
                "owner_required",
                "Only the owner can transfer ownership",
            );
        }
        const actor = await lockMembership(
            tx,
            input.teamId,
            input.actorAccountId,
        );
        if (!actor) throw new MembershipError("forbidden", "not_a_team_member");
        const [target] = await tx
            .select()
            .from(teamMembers)
            .where(
                and(
                    eq(teamMembers.teamId, input.teamId),
                    eq(teamMembers.memberId, input.memberId),
                ),
            );
        if (!target) throw new MembershipError("not_found", "Member not found");
        if (target.accountId === team.ownerAccountId) {
            throw new MembershipError("conflict", "Already the owner");
        }

        const fullSet = [...GRANTABLE_NON_OWNER_PERMISSIONS];
        await tx
            .update(teams)
            .set({
                ownerAccountId: target.accountId,
                updatedAt: new Date(),
            })
            .where(eq(teams.id, input.teamId));
        await tx
            .update(teamMembers)
            .set({
                role: "member",
                permissions: fullSet,
                version: actor.version + 1,
                updatedAt: new Date(),
            })
            .where(eq(teamMembers.id, actor.id));
        await tx
            .update(teamMembers)
            .set({
                role: "owner",
                permissions: [],
                version: target.version + 1,
                updatedAt: new Date(),
            })
            .where(eq(teamMembers.id, target.id));

        if (input.revokeApiKeys) {
            const keys = await getApiKeysByTeamId(input.teamId, tx);
            for (const key of keys) {
                await deleteApiKey(input.teamId, key.id, tx);
                await insertAuditEvent(tx, {
                    eventType: "api_key.revoked",
                    teamPublicId: team.teamId,
                    actorAccountId: input.actorAccountId,
                    metadata: { keyId: key.id, keyPrefix: key.keyPrefix },
                });
            }
        }

        await insertAuditEvent(tx, {
            eventType: "ownership.transferred",
            teamPublicId: team.teamId,
            actorAccountId: input.actorAccountId,
            targetMemberId: target.memberId,
            afterPermissions: fullSet,
        });

        const [updated] = await tx
            .select()
            .from(teams)
            .where(eq(teams.id, input.teamId));
        return updated;
    });
}

export async function createOrResendInvitation(
    input: {
        teamId: string;
        actorAccountId: string;
        email: string;
        permissions: readonly string[];
        invitationId?: string;
    },
    mailer: InvitationMailer = sendInvitationEmail,
) {
    const email = normalizeInvitationEmail(input.email);
    const proposed = normalizePermissionGrants(input.permissions);
    const proposedEffective = computeEffectivePermissions(proposed);
    const { raw, hash } = generateInvitationToken();
    const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);

    const invitation = await withDbTransaction(async (tx) => {
        await expirePendingInvitationsInTx(tx, {
            teamId: input.teamId,
            email,
            limit: 1,
        });

        const team = await lockTeam(tx, input.teamId);
        if (!team) throw new MembershipError("not_found", "Team not found");
        const actor = await lockMembership(
            tx,
            input.teamId,
            input.actorAccountId,
        );
        if (!actor) throw new MembershipError("forbidden", "not_a_team_member");
        const actorView = actorSnapshot(team, actor);
        const decision = evaluateInvitationDelegation({
            actorIsOwner: actorView.isOwner,
            actorEffective: actorView.effective,
            proposedEffective,
        });
        if (!decision.allowed) {
            throw new MembershipError("forbidden", decision.reason);
        }

        const existingMember = await tx
            .select({ id: teamMembers.id })
            .from(teamMembers)
            .innerJoin(accounts, eq(teamMembers.accountId, accounts.id))
            .where(
                and(
                    eq(teamMembers.teamId, input.teamId),
                    eq(accounts.email, email),
                ),
            )
            .limit(1);
        if (existingMember.length > 0) {
            throw new MembershipError("conflict", "Already a member");
        }

        let existing = input.invitationId
            ? (
                  await tx
                      .select()
                      .from(teamInvitations)
                      .where(
                          and(
                              eq(teamInvitations.teamId, input.teamId),
                              eq(
                                  teamInvitations.invitationId,
                                  input.invitationId,
                              ),
                          ),
                      )
              )[0]
            : (
                  await tx
                      .select()
                      .from(teamInvitations)
                      .where(
                          and(
                              eq(teamInvitations.teamId, input.teamId),
                              eq(teamInvitations.email, email),
                              eq(teamInvitations.status, "pending"),
                          ),
                      )
              )[0];

        if (
            input.invitationId &&
            existing &&
            existing.email !== email &&
            input.email
        ) {
            // resend keeps the existing email
        }

        if (existing && existing.status !== "pending") {
            throw new MembershipError("not_found", "Invitation is not pending");
        }

        const eventType = existing ? "invitation.resent" : "invitation.created";
        if (existing) {
            const [updated] = await tx
                .update(teamInvitations)
                .set({
                    permissions: [...proposed],
                    invitedByAccountId: input.actorAccountId,
                    tokenHash: hash,
                    expiresAt,
                    updatedAt: new Date(),
                    status: "pending",
                })
                .where(
                    and(
                        eq(teamInvitations.id, existing.id),
                        eq(teamInvitations.status, "pending"),
                    ),
                )
                .returning();
            if (!updated)
                throw new MembershipError(
                    "not_found",
                    "Invitation is not pending",
                );
            existing = updated;
        } else {
            const [created] = await tx
                .insert(teamInvitations)
                .values({
                    teamId: input.teamId,
                    email,
                    permissions: [...proposed],
                    invitedByAccountId: input.actorAccountId,
                    tokenHash: hash,
                    expiresAt,
                    status: "pending",
                })
                .returning();
            existing = created;
        }

        await insertAuditEvent(tx, {
            eventType,
            teamPublicId: team.teamId,
            actorAccountId: input.actorAccountId,
            targetEmail: email,
            afterPermissions: proposedEffective,
        });
        return {
            row: existing,
            teamName: team.name,
            teamPublicId: team.teamId,
        };
    });

    const inviterName = await displayNameForAccount(input.actorAccountId);
    try {
        await mailer({
            to: email,
            teamName: invitation.teamName,
            inviterName,
            expiresAt,
            acceptUrl: `${(webClientUrl || "http://localhost:3000").replace(/\/$/, "")}/team-invitations/${invitation.row.invitationId}#token=${raw}`,
            invitationId: invitation.row.invitationId,
            tokenHash: invitation.row.tokenHash,
        });
    } catch (error) {
        if (error instanceof InvitationDeliveryError) {
            throw new MembershipError(
                "delivery_failed",
                "Invitation could not be delivered",
            );
        }
        throw error;
    }

    return toPublicInvitation(invitation.row, inviterName);
}

export async function resendTeamInvitation(input: {
    teamId: string;
    actorAccountId: string;
    invitationId: string;
}) {
    await expirePendingInvitations({
        teamId: input.teamId,
        invitationId: input.invitationId,
        limit: 1,
    });
    const invitation = await db.query.teamInvitations.findFirst({
        where: and(
            eq(teamInvitations.teamId, input.teamId),
            eq(teamInvitations.invitationId, input.invitationId),
            eq(teamInvitations.status, "pending"),
        ),
    });
    if (!invitation) {
        throw new MembershipError("not_found", "Invitation not found");
    }
    return createOrResendInvitation({
        teamId: input.teamId,
        actorAccountId: input.actorAccountId,
        email: invitation.email,
        permissions: invitation.permissions ?? [],
        invitationId: input.invitationId,
    });
}

export async function revokeInvitation(input: {
    teamId: string;
    actorAccountId: string;
    invitationId: string;
}) {
    return withDbTransaction(async (tx) => {
        const team = await lockTeam(tx, input.teamId);
        if (!team) throw new MembershipError("not_found", "Team not found");
        const actor = await lockMembership(
            tx,
            input.teamId,
            input.actorAccountId,
        );
        if (!actor) throw new MembershipError("forbidden", "not_a_team_member");
        const [invitation] = await tx
            .select()
            .from(teamInvitations)
            .where(
                and(
                    eq(teamInvitations.teamId, input.teamId),
                    eq(teamInvitations.invitationId, input.invitationId),
                    eq(teamInvitations.status, "pending"),
                ),
            );
        if (!invitation)
            throw new MembershipError("not_found", "Invitation not found");

        const actorView = actorSnapshot(team, actor);
        const proposedEffective = computeEffectivePermissions(
            invitation.permissions ?? [],
        );
        const decision = evaluateInvitationDelegation({
            actorIsOwner: actorView.isOwner,
            actorEffective: actorView.effective,
            proposedEffective,
        });
        if (
            !decision.allowed &&
            !actorView.effective.includes("members:manage")
        ) {
            throw new MembershipError("forbidden", decision.reason);
        }
        if (
            !actorView.isOwner &&
            !isSubset(proposedEffective, actorView.effective)
        ) {
            throw new MembershipError("forbidden", "not_subset");
        }

        const [updated] = await tx
            .update(teamInvitations)
            .set({
                status: "revoked",
                revokedAt: new Date(),
                updatedAt: new Date(),
            })
            .where(
                and(
                    eq(teamInvitations.id, invitation.id),
                    eq(teamInvitations.status, "pending"),
                ),
            )
            .returning();
        if (!updated)
            throw new MembershipError("not_found", "Invitation not found");
        await insertAuditEvent(tx, {
            eventType: "invitation.revoked",
            teamPublicId: team.teamId,
            actorAccountId: input.actorAccountId,
            targetEmail: invitation.email,
        });
    });
}

function isSubset(
    inner: readonly TeamPermission[],
    outer: readonly TeamPermission[],
) {
    const allowed = new Set(outer);
    return inner.every((item) => allowed.has(item));
}

async function loadInvitationBySecret(invitationId: string, token: string) {
    await expirePendingInvitations({ invitationId, limit: 1 });
    const invitation = await db.query.teamInvitations.findFirst({
        where: eq(teamInvitations.invitationId, invitationId),
    });
    if (!invitation || !invitationTokensMatch(token, invitation.tokenHash)) {
        return null;
    }
    return invitation;
}

export async function previewInvitation(input: {
    invitationId: string;
    token: string;
    accountEmail: string;
}) {
    const invitation = await loadInvitationBySecret(
        input.invitationId,
        input.token,
    );
    if (!invitation)
        throw new MembershipError("not_found", "Invitation not found");
    if (invitation.status !== "pending") {
        throw new MembershipError("not_found", "Invitation is not pending");
    }
    if (invitation.expiresAt.getTime() <= Date.now()) {
        throw new MembershipError("not_found", "Invitation expired");
    }
    if (normalizeInvitationEmail(input.accountEmail) !== invitation.email) {
        throw new MembershipError(
            "email_mismatch",
            "Email does not match invitation",
        );
    }
    const team = await db.query.teams.findFirst({
        where: eq(teams.id, invitation.teamId),
    });
    if (!team) throw new MembershipError("not_found", "Invitation not found");
    return {
        invitationId: invitation.invitationId,
        teamName: team.name,
        inviterName: await displayNameForAccount(invitation.invitedByAccountId),
        expiresAt: invitation.expiresAt.toISOString(),
        permissions: computeEffectivePermissions(invitation.permissions ?? []),
        email: invitation.email,
    };
}

export async function acceptInvitation(input: {
    invitationId: string;
    token: string;
    accountId: string;
    accountEmail: string;
}): Promise<AcceptedTeamMember> {
    const outcome:
        | AcceptedTeamMember
        | {
              error: "expired" | "stale_inviter_authority";
          } = await withDbTransaction(async (tx) => {
        const [invitation] = await tx
            .select()
            .from(teamInvitations)
            .where(eq(teamInvitations.invitationId, input.invitationId));
        if (
            !invitation ||
            !invitationTokensMatch(input.token, invitation.tokenHash)
        ) {
            throw new MembershipError("not_found", "Invitation not found");
        }
        if (invitation.status === "accepted") {
            const existing = await tx.query.teamMembers.findFirst({
                where: and(
                    eq(teamMembers.teamId, invitation.teamId),
                    eq(teamMembers.accountId, input.accountId),
                ),
            });
            if (existing) {
                const team = await tx.query.teams.findFirst({
                    where: eq(teams.id, invitation.teamId),
                });
                if (!team) {
                    throw new MembershipError(
                        "not_found",
                        "Invitation not found",
                    );
                }
                const account = await tx.query.accounts.findFirst({
                    where: eq(accounts.id, input.accountId),
                });
                return {
                    ...toPublicMember({
                        member: existing,
                        email: account?.email ?? input.accountEmail,
                        name: await displayNameForAccount(input.accountId, tx),
                        ownerAccountId: team.ownerAccountId,
                    }),
                    teamId: team.teamId,
                };
            }
        }
        if (invitation.status !== "pending") {
            throw new MembershipError("not_found", "Invitation is not pending");
        }
        if (invitation.expiresAt.getTime() <= Date.now()) {
            await expirePendingInvitationsInTx(tx, {
                invitationId: invitation.invitationId,
                limit: 1,
            });
            return { error: "expired" as const };
        }
        if (normalizeInvitationEmail(input.accountEmail) !== invitation.email) {
            throw new MembershipError(
                "email_mismatch",
                "Email does not match invitation",
            );
        }

        const team = await lockTeam(tx, invitation.teamId);
        if (!team)
            throw new MembershipError("not_found", "Invitation not found");

        const existing = await tx.query.teamMembers.findFirst({
            where: and(
                eq(teamMembers.teamId, invitation.teamId),
                eq(teamMembers.accountId, input.accountId),
            ),
        });
        if (existing) {
            await tx
                .update(teamInvitations)
                .set({
                    status: "accepted",
                    acceptedAt: new Date(),
                    updatedAt: new Date(),
                })
                .where(
                    and(
                        eq(teamInvitations.id, invitation.id),
                        eq(teamInvitations.status, "pending"),
                    ),
                );
            return {
                ...toPublicMember({
                    member: existing,
                    email: input.accountEmail,
                    name: await displayNameForAccount(input.accountId, tx),
                    ownerAccountId: team.ownerAccountId,
                }),
                teamId: team.teamId,
            };
        }

        const inviter = invitation.invitedByAccountId
            ? await lockMembership(
                  tx,
                  invitation.teamId,
                  invitation.invitedByAccountId,
              )
            : null;
        const proposedEffective = computeEffectivePermissions(
            invitation.permissions ?? [],
        );
        const inviterView = inviter
            ? actorSnapshot(team, inviter)
            : { isOwner: false, effective: [] as TeamPermission[] };
        const decision = evaluateInvitationDelegation({
            actorIsOwner: inviterView.isOwner,
            actorEffective: inviterView.effective,
            proposedEffective,
        });
        if (!decision.allowed) {
            const revoked = await tx
                .update(teamInvitations)
                .set({
                    status: "revoked",
                    revokedAt: new Date(),
                    updatedAt: new Date(),
                })
                .where(
                    and(
                        eq(teamInvitations.id, invitation.id),
                        eq(teamInvitations.status, "pending"),
                    ),
                )
                .returning({ id: teamInvitations.id });
            if (revoked.length > 0) {
                await insertAuditEvent(tx, {
                    eventType: "invitation.revoked",
                    teamPublicId: team.teamId,
                    targetEmail: invitation.email,
                    metadata: { reason: "stale_inviter_authority" },
                });
            }
            return { error: "stale_inviter_authority" as const };
        }

        // Insert the membership before claiming the invite. A crash after
        // claim-then-insert left an accepted invite with no member and
        // made retries fail. Insert-then-claim is idempotent on retry.
        let member;
        try {
            [member] = await tx
                .insert(teamMembers)
                .values({
                    teamId: invitation.teamId,
                    accountId: input.accountId,
                    role: "member",
                    permissions: invitation.permissions ?? [],
                })
                .returning();
        } catch (error) {
            if (!isUniqueConstraintViolation(error)) throw error;
            const raced = await tx.query.teamMembers.findFirst({
                where: and(
                    eq(teamMembers.teamId, invitation.teamId),
                    eq(teamMembers.accountId, input.accountId),
                ),
            });
            if (!raced) throw error;
            member = raced;
        }
        if (!member) {
            throw new MembershipError(
                "conflict",
                "Could not create membership",
            );
        }

        const claimed = await tx
            .update(teamInvitations)
            .set({
                status: "accepted",
                acceptedAt: new Date(),
                updatedAt: new Date(),
            })
            .where(
                and(
                    eq(teamInvitations.id, invitation.id),
                    eq(teamInvitations.status, "pending"),
                ),
            )
            .returning();
        if (claimed.length === 0) {
            const [current] = await tx
                .select()
                .from(teamInvitations)
                .where(eq(teamInvitations.id, invitation.id));
            if (current?.status !== "accepted") {
                throw new MembershipError(
                    "conflict",
                    "Invitation already resolved",
                );
            }
        }

        await insertAuditEvent(tx, {
            eventType: "invitation.accepted",
            teamPublicId: team.teamId,
            actorAccountId: input.accountId,
            targetMemberId: member.memberId,
            targetEmail: invitation.email,
            afterPermissions: computeEffectivePermissions(
                invitation.permissions ?? [],
            ),
        });

        return {
            ...toPublicMember({
                member,
                email: input.accountEmail,
                name: await displayNameForAccount(input.accountId, tx),
                ownerAccountId: team.ownerAccountId,
            }),
            teamId: team.teamId,
        };
    });
    if ("error" in outcome) {
        if (outcome.error === "expired") {
            throw new MembershipError("not_found", "Invitation expired");
        }
        throw new MembershipError("forbidden", "stale_inviter_authority");
    }
    return outcome;
}

export async function rejectInvitation(input: {
    invitationId: string;
    token: string;
    accountEmail: string;
    accountId: string;
}) {
    const outcome = await withDbTransaction(async (tx) => {
        const [invitation] = await tx
            .select()
            .from(teamInvitations)
            .where(eq(teamInvitations.invitationId, input.invitationId));
        if (
            !invitation ||
            !invitationTokensMatch(input.token, invitation.tokenHash)
        ) {
            throw new MembershipError("not_found", "Invitation not found");
        }
        if (invitation.status !== "pending") {
            throw new MembershipError("not_found", "Invitation is not pending");
        }
        if (invitation.expiresAt.getTime() <= Date.now()) {
            await expirePendingInvitationsInTx(tx, {
                invitationId: invitation.invitationId,
                limit: 1,
            });
            return "expired" as const;
        }
        if (normalizeInvitationEmail(input.accountEmail) !== invitation.email) {
            throw new MembershipError(
                "email_mismatch",
                "Email does not match invitation",
            );
        }
        const team = await tx.query.teams.findFirst({
            where: eq(teams.id, invitation.teamId),
        });
        const [updated] = await tx
            .update(teamInvitations)
            .set({
                status: "rejected",
                rejectedAt: new Date(),
                updatedAt: new Date(),
            })
            .where(
                and(
                    eq(teamInvitations.id, invitation.id),
                    eq(teamInvitations.status, "pending"),
                ),
            )
            .returning();
        if (!updated)
            throw new MembershipError("not_found", "Invitation is not pending");
        await insertAuditEvent(tx, {
            eventType: "invitation.rejected",
            teamPublicId: team?.teamId ?? "",
            actorAccountId: input.accountId,
            targetEmail: invitation.email,
        });
        return "rejected" as const;
    });
    if (outcome === "expired") {
        throw new MembershipError("not_found", "Invitation expired");
    }
}

export async function assertAccountDoesNotOwnTeams(accountId: string) {
    const owned = await db.query.teams.findFirst({
        where: eq(teams.ownerAccountId, accountId),
    });
    if (owned) {
        throw new MembershipError(
            "owns_teams",
            "Transfer or delete owned teams before deleting this account",
        );
    }
}

export { hashInvitationToken, generateInvitationToken };

export async function reportOwnershipInvariants() {
    const missingOwners = await db
        .select({ id: teams.id })
        .from(teams)
        .where(
            sql`not exists (
                select 1 from ${teamMembers}
                where ${teamMembers.teamId} = ${teams.id}
                  and ${teamMembers.accountId} = ${teams.ownerAccountId}
            )`,
        );
    const extraOwnerRoles = await db
        .select({ id: teamMembers.id })
        .from(teamMembers)
        .innerJoin(teams, eq(teams.id, teamMembers.teamId))
        .where(
            and(
                eq(teamMembers.role, "owner"),
                sql`${teamMembers.accountId} <> ${teams.ownerAccountId}`,
            ),
        );
    return {
        missingOwnerMemberships: missingOwners.length,
        unexpectedOwnerRoleRows: extraOwnerRoles.length,
    };
}
