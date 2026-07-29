import crypto from "node:crypto";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { createExpressEndpoints, initServer } from "@ts-rest/express";
import { contract } from "@frontlit/api-contract";
import {
    findOrCreateBareAccount,
    findOrCreateTeamByExternalId,
} from "../team/queries";
import { logger } from "../services/log";

const router = Router();

const provisioningLimiter = rateLimit({
    windowMs: 60_000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "too_many_requests", error_description: "Too many requests." },
});
// This router is mounted at the API root, so an unqualified middleware
// would rate-limit unrelated dashboard and public requests.
router.use("/provisioning", provisioningLimiter);

/** Constant-time comparison so an invalid secret can't be brute-forced via
 * response-time differences. */
function isValidSecret(provided: string | undefined): boolean {
    const expected = process.env.PROVISIONING_SECRET;
    if (!expected || !provided) return false;
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
}

const s = initServer();

/**
 * Server-to-server provisioning for multi-tenant consumers: one team per one
 * of the consumer's own tenants. Guarded by a static shared secret rather
 * than session/API-key auth, since at provisioning time no team exists yet
 * for the caller to authenticate as. Idempotent: calling this again for the
 * same `externalId` returns the same team rather than creating a duplicate —
 * but `apiKey` is only present on the call that created the team (keys are
 * stored hashed, so the secret can never be re-read); the consumer must
 * persist it.
 */
const impl = s.router(contract.provisioning, {
    provisionTeam: async ({ body, req }) => {
        if (!isValidSecret(req.headers["x-frontlit-provisioning-secret"] as string | undefined)) {
            return { status: 401, body: { error: "unauthorized" } };
        }

        try {
            const account = await findOrCreateBareAccount(body.ownerEmail);
            const team = await findOrCreateTeamByExternalId({
                externalId: body.externalId,
                ownerAccountId: account.id,
                name: body.name,
                ownerEmail: body.ownerEmail,
            });
            return {
                status: 200,
                body: {
                    teamId: team.teamId,
                    name: team.name,
                    apiKey: team.defaultApiKeySecret,
                },
            };
        } catch (err) {
            logger.error({ error: (err as Error).message }, "Team provisioning failed");
            return { status: 500, body: { error: "server_error" } };
        }
    },
});

createExpressEndpoints(contract.provisioning, impl, router);

export default router;
