import { Router, Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import { createExpressEndpoints, initServer } from "@ts-rest/express";
import { contract } from "@frontlit/api-contract";
import { requireAuth } from "../auth/middleware";
import { withOperation } from "../auth/authorize";
import {
    createTeam,
    deleteTeam,
    findTeamByPublicId,
    getTeamMembership,
    listTeamsForAccount,
    renameTeam,
} from "./queries";
import {
    createApiKey,
    deleteApiKey,
    getApiKeysByTeamId,
} from "../apikey/queries";
import { serializeDates } from "../utils/public";
import { withDbTransaction } from "../db/transaction";
import { insertAuditEvent } from "./audit";
import {
    acceptInvitation,
    createOrResendInvitation,
    listTeamInvitations,
    listTeamMembers,
    MembershipError,
    previewInvitation,
    rejectInvitation,
    resendTeamInvitation,
    removeOrLeaveMember,
    revokeInvitation,
    transferOwnership,
    updateMemberPermissions,
} from "./membership";

const router = Router();
router.use("/teams", requireAuth);
router.use("/team-invitations", requireAuth);

const invitationLimiter = rateLimit({
    windowMs: 60_000,
    max: 20,
    skip: () => process.env.NODE_ENV === "test",
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) =>
        `${(req as any).accountId ?? req.ip}:${(req as any).teamId ?? "none"}`,
    message: {
        error: "too_many_requests",
        error_description: "Too many invitation requests.",
    },
});

const acceptLimiter = rateLimit({
    windowMs: 60_000,
    max: 20,
    skip: () => process.env.NODE_ENV === "test",
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
        const invitationId = String(req.body?.invitationId ?? "");
        const prefix = invitationId.slice(0, 12);
        return `${req.ip}:${prefix}`;
    },
    message: {
        error: "too_many_requests",
        error_description: "Too many invitation attempts.",
    },
});

router.use("/teams", (req: Request, res: Response, next: NextFunction) => {
    if (!["oauth", "session"].includes((req as any).authKind)) {
        res.status(403).json({
            error: "user_auth_required",
            error_description:
                "Team management requires a user-authenticated session, not an API key.",
        });
        return;
    }
    next();
});

router.use(
    "/team-invitations",
    (req: Request, res: Response, next: NextFunction) => {
        if ((req as any).authKind !== "session") {
            res.status(403).json({
                error: "unsupported_auth",
                error_description:
                    "Invitation accept and preview require a browser session.",
            });
            return;
        }
        next();
    },
);

const s = initServer();

function toPublicTeam<T extends { id: string }>(team: T) {
    const { id: _id, ...publicTeam } = team;
    return publicTeam;
}

async function resolveTeamParam(teamId: string, accountId: string) {
    const team = await findTeamByPublicId(teamId);
    if (!team) return null;
    const membership = await getTeamMembership(team.id, accountId);
    if (!membership) return null;
    return { team, membership };
}

function membershipError(error: unknown) {
    if (!(error instanceof MembershipError)) throw error;
    if (error.code === "not_found") {
        return { status: 404 as const, body: { error: error.message } };
    }
    if (error.code === "conflict" || error.code === "stale_version") {
        return { status: 409 as const, body: { error: error.message } };
    }
    if (error.code === "delivery_failed") {
        return {
            status: 502 as const,
            body: { error: "invitation_delivery_failed" },
        };
    }
    if (error.code === "owner_required") {
        return {
            status: 403 as const,
            body: { error: "owner_required", error_description: error.message },
        };
    }
    return {
        status: 403 as const,
        body: {
            error:
                error.code === "email_mismatch"
                    ? "email_mismatch"
                    : "insufficient_permission",
            error_description: error.message,
        },
    };
}

function withResolvedTeam(
    operation: Parameters<typeof withOperation>[0],
    handler: (
        args: any,
        resolved: NonNullable<Awaited<ReturnType<typeof resolveTeamParam>>>,
    ) => Promise<any>,
) {
    return async (args: any) => {
        const resolved = await resolveTeamParam(
            args.params.teamId,
            (args.req as any).accountId,
        );
        if (!resolved) {
            return { status: 404, body: { error: "Team not found" } };
        }
        const request = args.req as any;
        if (
            request.authKind === "oauth" &&
            (request.oauthTeamInvalid ||
                request.claimedTeamId !== resolved.team.id)
        ) {
            return {
                status: 403,
                body: {
                    error: "not_a_team_member",
                    error_description:
                        "This OAuth token is not valid for the requested team.",
                },
            };
        }
        (args.req as any).teamId = resolved.team.id;
        return withOperation(operation, (inner) => handler(inner, resolved))(
            args,
        );
    };
}

const impl = s.router(contract.teams, {
    list: withOperation("teams.list", async ({ req }) => {
        const teams = await listTeamsForAccount((req as any).accountId);
        return {
            status: 200,
            body: { items: teams.map((t) => serializeDates(toPublicTeam(t))) },
        };
    }),
    create: withOperation("teams.create", async ({ body, req }) => {
        const team = await createTeam({
            ownerAccountId: (req as any).accountId,
            name: body.name,
            ownerEmail: (req as any).account?.email,
        });
        return { status: 201, body: serializeDates(toPublicTeam(team)) };
    }),
    rename: withResolvedTeam("teams.rename", async ({ body }, resolved) => {
        const team = await renameTeam(resolved.team.id, body.name);
        return { status: 200, body: serializeDates(toPublicTeam(team)) };
    }),
    remove: withResolvedTeam("teams.remove", async (_args, resolved) => {
        await deleteTeam(resolved.team.id);
        return { status: 204, body: undefined };
    }),
    listKeys: withResolvedTeam("teams.listKeys", async (_args, resolved) => {
        const keys = await getApiKeysByTeamId(resolved.team.id);
        return {
            status: 200,
            body: {
                items: keys.map(({ keyHash: _, teamId: _t, ...key }) =>
                    serializeDates(key),
                ),
            },
        };
    }),
    createKey: withResolvedTeam(
        "teams.createKey",
        async ({ body, req }, resolved) => {
            const result = await withDbTransaction(async (tx) => {
                const {
                    apiKey: { keyHash: _, teamId: _t, ...apiKey },
                    secret,
                } = await createApiKey(resolved.team.id, body.name, tx);
                await insertAuditEvent(tx, {
                    eventType: "api_key.created",
                    teamPublicId: resolved.team.teamId,
                    actorAccountId: (req as any).accountId,
                    metadata: { keyPrefix: apiKey.keyPrefix },
                });
                return { apiKey, secret };
            });
            return {
                status: 201,
                body: { ...serializeDates(result.apiKey), key: result.secret },
            };
        },
    ),
    removeKey: withResolvedTeam(
        "teams.removeKey",
        async ({ params, req }, resolved) => {
            const deleted = await withDbTransaction(async (tx) => {
                const removed = await deleteApiKey(
                    resolved.team.id,
                    params.keyId,
                    tx,
                );
                if (!removed) return false;
                await insertAuditEvent(tx, {
                    eventType: "api_key.revoked",
                    teamPublicId: resolved.team.teamId,
                    actorAccountId: (req as any).accountId,
                    metadata: { keyId: params.keyId },
                });
                return true;
            });
            if (!deleted) {
                return { status: 404, body: { error: "API key not found" } };
            }
            return { status: 204, body: undefined };
        },
    ),
    listMembers: withResolvedTeam(
        "teams.listMembers",
        async ({ query, req }, resolved) => {
            const page = await listTeamMembers({
                teamId: resolved.team.id,
                ownerAccountId: resolved.team.ownerAccountId,
                viewerAccountId: (req as any).accountId,
                cursor: query.cursor,
                limit: query.limit,
            });
            return { status: 200, body: page };
        },
    ),
    updateMember: withResolvedTeam(
        "teams.updateMember",
        async ({ params, body, req }, resolved) => {
            try {
                const member = await updateMemberPermissions({
                    teamId: resolved.team.id,
                    actorAccountId: (req as any).accountId,
                    memberId: params.memberId,
                    permissions: body.permissions,
                    version: body.version,
                });
                return { status: 200, body: member };
            } catch (error) {
                return membershipError(error) as any;
            }
        },
    ),
    removeMember: withResolvedTeam(
        "teams.removeMember",
        async ({ params, req }, resolved) => {
            try {
                await removeOrLeaveMember({
                    teamId: resolved.team.id,
                    actorAccountId: (req as any).accountId,
                    memberId: params.memberId,
                    leave: false,
                });
                return { status: 204, body: undefined };
            } catch (error) {
                return membershipError(error) as any;
            }
        },
    ),
    leave: withResolvedTeam("teams.leave", async ({ req }, resolved) => {
        try {
            await removeOrLeaveMember({
                teamId: resolved.team.id,
                actorAccountId: (req as any).accountId,
                leave: true,
            });
            return { status: 204, body: undefined };
        } catch (error) {
            return membershipError(error) as any;
        }
    }),
    transferOwnership: withResolvedTeam(
        "teams.transferOwnership",
        async ({ body, req }, resolved) => {
            try {
                const team = await transferOwnership({
                    teamId: resolved.team.id,
                    actorAccountId: (req as any).accountId,
                    memberId: body.memberId,
                    revokeApiKeys: body.revokeApiKeys,
                });
                return {
                    status: 200,
                    body: serializeDates(toPublicTeam(team)),
                };
            } catch (error) {
                return membershipError(error) as any;
            }
        },
    ),
    listInvitations: withResolvedTeam(
        "teams.listInvitations",
        async ({ query }, resolved) => {
            const page = await listTeamInvitations({
                teamId: resolved.team.id,
                cursor: query.cursor,
                limit: query.limit,
            });
            return { status: 200, body: page };
        },
    ),
    createInvitation: withResolvedTeam(
        "teams.createInvitation",
        async ({ body, req }, resolved) => {
            try {
                const invitation = await createOrResendInvitation({
                    teamId: resolved.team.id,
                    actorAccountId: (req as any).accountId,
                    email: body.email,
                    permissions: body.permissions,
                });
                return { status: 201, body: invitation };
            } catch (error) {
                return membershipError(error) as any;
            }
        },
    ),
    resendInvitation: withResolvedTeam(
        "teams.resendInvitation",
        async ({ params, req }, resolved) => {
            try {
                const invitation = await resendTeamInvitation({
                    teamId: resolved.team.id,
                    actorAccountId: (req as any).accountId,
                    invitationId: params.invitationId,
                });
                return { status: 200, body: invitation };
            } catch (error) {
                return membershipError(error) as any;
            }
        },
    ),
    revokeInvitation: withResolvedTeam(
        "teams.revokeInvitation",
        async ({ params, req }, resolved) => {
            try {
                await revokeInvitation({
                    teamId: resolved.team.id,
                    actorAccountId: (req as any).accountId,
                    invitationId: params.invitationId,
                });
                return { status: 204, body: undefined };
            } catch (error) {
                return membershipError(error) as any;
            }
        },
    ),
});

const invitationImpl = s.router(contract.teamInvitations, {
    preview: withOperation("teamInvitations.preview", async ({ body, req }) => {
        try {
            const preview = await previewInvitation({
                invitationId: body.invitationId,
                token: body.token,
                accountEmail: (req as any).account.email,
            });
            return { status: 200, body: preview };
        } catch (error) {
            return membershipError(error) as any;
        }
    }),
    accept: withOperation("teamInvitations.accept", async ({ body, req }) => {
        try {
            const member = await acceptInvitation({
                invitationId: body.invitationId,
                token: body.token,
                accountId: (req as any).accountId,
                accountEmail: (req as any).account.email,
            });
            return { status: 200, body: member };
        } catch (error) {
            return membershipError(error) as any;
        }
    }),
    reject: withOperation("teamInvitations.reject", async ({ body, req }) => {
        try {
            await rejectInvitation({
                invitationId: body.invitationId,
                token: body.token,
                accountId: (req as any).accountId,
                accountEmail: (req as any).account.email,
            });
            return { status: 204, body: undefined };
        } catch (error) {
            return membershipError(error) as any;
        }
    }),
});

router.use("/teams/:teamId/invitations", invitationLimiter);
router.use("/team-invitations", acceptLimiter);

createExpressEndpoints(contract.teams, impl, router);
createExpressEndpoints(contract.teamInvitations, invitationImpl, router);

export default router;
