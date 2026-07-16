import { Router, Request, Response, NextFunction } from "express";
import { createExpressEndpoints, initServer } from "@ts-rest/express";
import { contract } from "@frontlit/api-contract";
import { requireAuth } from "../auth/middleware";
import {
    createTeam,
    deleteTeam,
    findTeamByPublicId,
    getTeamMembership,
    listTeamsForAccount,
    renameTeam,
} from "./queries";
import { createApiKey, deleteApiKey, getApiKeysByTeamId } from "../apikey/queries";
import { serializeDates } from "../utils/public";

const router = Router();
router.use(requireAuth);

/**
 * Team management is account-level (list/create/rename/delete which teams
 * an account belongs to), not team-scoped — unlike every other router, this
 * one does not run `requireTeam`. It's also restricted to session auth: an
 * API key is intentionally scoped to exactly one team, so letting it
 * enumerate/manage every team its owning account belongs to would defeat
 * that isolation.
 *
 * Scoped to `/teams` (not a blanket `router.use(...)`): this router is
 * mounted path-less via `app.use(teamRoutes)`, so an unscoped `.use()` here
 * would run for *every* request that reaches this point in the middleware
 * chain — including ones bound for a later-mounted router like
 * `/docs/search` — and reject any of them made with an API key, before
 * they ever got a chance to match their real route. (The same class of bug
 * fixed for `/public/*` in index.ts — see the comment there.)
 */
router.use("/teams", (req: Request, res: Response, next: NextFunction) => {
    if ((req as any).authKind !== "session") {
        res.status(403).json({
            error: "user_auth_required",
            error_description: "Team management requires a user-authenticated session, not an API key.",
        });
        return;
    }
    next();
});

const s = initServer();

/** `teams.teamId` is this row's *own* public identifier, not an internal
 * tenant-FK to another resource — so only drop `id`, never `teamId`. */
function toPublicTeam<T extends { id: string }>(team: T) {
    const { id: _id, ...publicTeam } = team;
    return publicTeam;
}

/** Resolves a route's public `:teamId` param to its internal id, 404-ing if
 * it doesn't resolve to a team the caller is even a member of. */
async function resolveTeamParam(teamId: string, accountId: string) {
    const team = await findTeamByPublicId(teamId);
    if (!team) return null;
    const membership = await getTeamMembership(team.id, accountId);
    if (!membership) return null;
    return { team, membership };
}

const impl = s.router(contract.teams, {
    list: async ({ req }) => {
        const teams = await listTeamsForAccount((req as any).accountId);
        return { status: 200, body: { items: teams.map((t) => serializeDates(toPublicTeam(t))) } };
    },
    create: async ({ body, req }) => {
        // No default API key here — the dashboard has no surface to show its
        // one-time secret at creation time. Users mint keys explicitly via
        // `createKey`, which does return the secret once.
        const team = await createTeam({ ownerAccountId: (req as any).accountId, name: body.name, ownerEmail: (req as any).account?.email });
        return { status: 201, body: serializeDates(toPublicTeam(team)) };
    },
    rename: async ({ params, body, req }) => {
        const resolved = await resolveTeamParam(params.teamId, (req as any).accountId);
        if (!resolved) return { status: 404, body: { error: "Team not found" } };
        const team = await renameTeam(resolved.team.id, body.name);
        return { status: 200, body: serializeDates(toPublicTeam(team)) };
    },
    remove: async ({ params, req }) => {
        const resolved = await resolveTeamParam(params.teamId, (req as any).accountId);
        if (!resolved) return { status: 404, body: { error: "Team not found" } };
        if (resolved.membership.role !== "owner") {
            return { status: 403, body: { error: "Only the team owner can delete it" } };
        }
        await deleteTeam(resolved.team.id);
        return { status: 204, body: undefined };
    },
    listKeys: async ({ params, req }) => {
        const resolved = await resolveTeamParam(params.teamId, (req as any).accountId);
        if (!resolved) return { status: 404, body: { error: "Team not found" } };
        const keys = await getApiKeysByTeamId(resolved.team.id);
        // Strip keyHash (a hash of a live credential has no business in an
        // HTTP response) and teamId (an internal FK — the caller already
        // knows which team they're scoped to).
        return {
            status: 200,
            body: { items: keys.map(({ keyHash: _, teamId: _t, ...key }) => serializeDates(key)) },
        };
    },
    createKey: async ({ params, body, req }) => {
        const resolved = await resolveTeamParam(params.teamId, (req as any).accountId);
        if (!resolved) return { status: 404, body: { error: "Team not found" } };
        const {
            apiKey: { keyHash: _, teamId: _t, ...apiKey },
            secret,
        } = await createApiKey(resolved.team.id, body.name);
        return { status: 201, body: { ...serializeDates(apiKey), key: secret } };
    },
    removeKey: async ({ params, req }) => {
        const resolved = await resolveTeamParam(params.teamId, (req as any).accountId);
        if (!resolved) return { status: 404, body: { error: "Team not found" } };
        await deleteApiKey(resolved.team.id, params.keyId);
        return { status: 204, body: undefined };
    },
});

createExpressEndpoints(contract.teams, impl, router);

export default router;
