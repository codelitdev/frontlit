import { Router } from "express";
import { createExpressEndpoints, initServer } from "@ts-rest/express";
import { contract } from "@frontlit/api-contract";
import { requireAuth } from "../auth/middleware";
import { requireTeam } from "../auth/require-team";
import {
    attachCustomDomain,
    getDomainSettings,
    removeCustomDomain,
    setTeamSubdomain,
    verifyCustomDomain,
} from "./queries";
import { findTeamById } from "../team/queries";
import { revalidateTeam } from "../services/revalidate";

const router = Router();
router.use("/domain", requireAuth, requireTeam);

const s = initServer();

function toPublicSettings(settings: NonNullable<Awaited<ReturnType<typeof getDomainSettings>>>) {
    return {
        ...settings,
        customDomain: settings.customDomain
            ? {
                  ...settings.customDomain,
                  verifiedAt: settings.customDomain.verifiedAt?.toISOString() ?? null,
              }
            : null,
    };
}

/** Every domain mutation changes what host(s) a team's site resolves at
 * (architecture.md §12.2's "revalidated on ... domain changes") — best
 * effort, never blocks the response. */
async function revalidateAfterDomainChange(internalTeamId: string): Promise<void> {
    const team = await findTeamById(internalTeamId);
    if (team) revalidateTeam(team.teamId).catch(() => {});
}

const impl = s.router(contract.domains, {
    get: async ({ req }) => {
        const settings = await getDomainSettings((req as any).teamId);
        return { status: 200, body: toPublicSettings(settings!) };
    },
    setSubdomain: async ({ body, req }) => {
        const result = await setTeamSubdomain((req as any).teamId, body.slug);
        if (!result.ok) return { status: 409, body: { error: "That subdomain is already taken" } };
        await revalidateAfterDomainChange((req as any).teamId);
        return { status: 200, body: toPublicSettings((await getDomainSettings((req as any).teamId))!) };
    },
    attachCustomDomain: async ({ body, req }) => {
        const result = await attachCustomDomain((req as any).teamId, body.hostname);
        if (!result.ok) {
            const messages = {
                subdomain_required: "Choose a FrontLit subdomain before attaching a custom domain",
                reserved: "That hostname is reserved for default team subdomains",
                already_attached: "This team already has a custom domain attached — remove it first",
                taken: "That domain is already attached to another team",
            };
            return { status: 409, body: { error: messages[result.reason] } };
        }
        await revalidateAfterDomainChange((req as any).teamId);
        return { status: 200, body: toPublicSettings((await getDomainSettings((req as any).teamId))!) };
    },
    verifyCustomDomain: async ({ req }) => {
        const updated = await verifyCustomDomain((req as any).teamId);
        if (!updated) return { status: 404, body: { error: "No custom domain attached" } };
        await revalidateAfterDomainChange((req as any).teamId);
        return { status: 200, body: toPublicSettings((await getDomainSettings((req as any).teamId))!) };
    },
    removeCustomDomain: async ({ req }) => {
        const removed = await removeCustomDomain((req as any).teamId);
        if (!removed) return { status: 404, body: { error: "No custom domain attached" } };
        await revalidateAfterDomainChange((req as any).teamId);
        return { status: 200, body: toPublicSettings((await getDomainSettings((req as any).teamId))!) };
    },
});

createExpressEndpoints(contract.domains, impl, router);

export default router;
