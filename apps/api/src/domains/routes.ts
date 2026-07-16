import { Router } from "express";
import { createExpressEndpoints, initServer } from "@ts-rest/express";
import { contract } from "@frontlit/api-contract";
import { requireAuth } from "../auth/middleware";
import { requireTeam } from "../auth/require-team";
import {
    attachCustomDomain,
    domainKind,
    getDomainSettings,
    removeCustomDomain,
    setPrimaryDomain,
    setTeamSubdomain,
    verifyCustomDomain,
} from "./queries";
import { omitInternal, serializeDates } from "../utils/public";
import { findTeamById } from "../team/queries";
import { revalidateTeam } from "../services/revalidate";

const router = Router();
router.use(requireAuth);
router.use(requireTeam);

const s = initServer();

function toPublicDomain<T extends Record<string, unknown> & { hostname: string }>(row: T) {
    return serializeDates({ ...omitInternal(row, "teamId"), kind: domainKind(row.hostname) });
}

function toPublicSettings(settings: Awaited<ReturnType<typeof getDomainSettings>>) {
    return {
        subdomain: toPublicDomain(settings.subdomain!),
        customDomain: settings.customDomain ? toPublicDomain(settings.customDomain) : null,
        verificationRecords: settings.verificationRecords,
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
        return { status: 200, body: toPublicSettings(settings) };
    },
    setSubdomain: async ({ body, req }) => {
        const result = await setTeamSubdomain((req as any).teamId, body.slug);
        if (!result.ok) return { status: 409, body: { error: "That subdomain is already taken" } };
        await revalidateAfterDomainChange((req as any).teamId);
        return { status: 200, body: toPublicSettings(await getDomainSettings((req as any).teamId)) };
    },
    attachCustomDomain: async ({ body, req }) => {
        const result = await attachCustomDomain((req as any).teamId, body.hostname);
        if (!result.ok) {
            const messages = {
                reserved: "That hostname is reserved for default team subdomains",
                already_attached: "This team already has a custom domain attached — remove it first",
                taken: "That domain is already attached to another team",
            };
            return { status: 409, body: { error: messages[result.reason] } };
        }
        return { status: 200, body: toPublicSettings(await getDomainSettings((req as any).teamId)) };
    },
    verifyCustomDomain: async ({ req }) => {
        const updated = await verifyCustomDomain((req as any).teamId);
        if (!updated) return { status: 404, body: { error: "No custom domain attached" } };
        return { status: 200, body: toPublicSettings(await getDomainSettings((req as any).teamId)) };
    },
    removeCustomDomain: async ({ req }) => {
        const removed = await removeCustomDomain((req as any).teamId);
        if (!removed) return { status: 404, body: { error: "No custom domain attached" } };
        await revalidateAfterDomainChange((req as any).teamId);
        return { status: 200, body: toPublicSettings(await getDomainSettings((req as any).teamId)) };
    },
    setPrimary: async ({ body, req }) => {
        const result = await setPrimaryDomain((req as any).teamId, body.primary);
        if (!result.ok) {
            const messages = {
                no_subdomain: "Team has no subdomain provisioned",
                custom_not_verified: "The custom domain must be verified before it can be made primary",
            };
            return { status: 409, body: { error: messages[result.reason] } };
        }
        await revalidateAfterDomainChange((req as any).teamId);
        return { status: 200, body: toPublicSettings(await getDomainSettings((req as any).teamId)) };
    },
});

createExpressEndpoints(contract.domains, impl, router);

export default router;
