import { Router } from "express";
import { createExpressEndpoints, initServer } from "@ts-rest/express";
import { contract } from "@frontlit/api-contract";
import { requireAuth } from "../auth/middleware";
import { requireTeam } from "../auth/require-team";
import { authorizeHandlers } from "../auth/authorize";
import {
    attachCustomDomain,
    getDomainSettings,
    removeCustomDomain,
    setSubdomainPublic,
    setTeamSubdomain,
    verifyCustomDomain,
} from "./queries";
import { revalidateAfterDomainChange } from "./revalidate";

const router = Router();
router.use("/domain", requireAuth, requireTeam);

const s = initServer();

function toPublicSettings(
    settings: NonNullable<Awaited<ReturnType<typeof getDomainSettings>>>,
) {
    return {
        ...settings,
        customDomain: settings.customDomain
            ? {
                  ...settings.customDomain,
                  verifiedAt:
                      settings.customDomain.verifiedAt?.toISOString() ?? null,
              }
            : null,
    };
}

const impl = s.router(
    contract.domains,
    authorizeHandlers(
        {
            get: async ({ req }) => {
                const settings = await getDomainSettings((req as any).teamId);
                return { status: 200, body: toPublicSettings(settings!) };
            },
            setSubdomain: async ({ body, req }) => {
                const previous = await getDomainSettings((req as any).teamId);
                const result = await setTeamSubdomain(
                    (req as any).teamId,
                    body.slug,
                );
                if (!result.ok)
                    return {
                        status: 409,
                        body: {
                            error:
                                result.reason === "reserved"
                                    ? "That subdomain is reserved"
                                    : "That subdomain is already taken",
                        },
                    };
                await revalidateAfterDomainChange(
                    (req as any).teamId,
                    previous?.subdomain ? [previous.subdomain.hostname] : [],
                );
                return {
                    status: 200,
                    body: toPublicSettings(
                        (await getDomainSettings((req as any).teamId))!,
                    ),
                };
            },
            setSubdomainPublic: async ({ body, req }) => {
                const result = await setSubdomainPublic(
                    (req as any).teamId,
                    body.subdomainPublic,
                );
                if (!result.ok)
                    return {
                        status: 409,
                        body: {
                            error: "A verified custom domain is required to hide the FrontLit subdomain",
                        },
                    };
                await revalidateAfterDomainChange((req as any).teamId);
                return {
                    status: 200,
                    body: toPublicSettings(
                        (await getDomainSettings((req as any).teamId))!,
                    ),
                };
            },
            attachCustomDomain: async ({ body, req }) => {
                const previous = await getDomainSettings((req as any).teamId);
                const result = await attachCustomDomain(
                    (req as any).teamId,
                    body.hostname,
                );
                if (!result.ok) {
                    const messages = {
                        subdomain_required:
                            "Choose a FrontLit subdomain before attaching a custom domain",
                        reserved:
                            "That hostname is reserved for default team subdomains",
                        already_attached:
                            "This team already has a custom domain attached — remove it first",
                        taken: "That domain is already attached to another team",
                    };
                    return {
                        status: 409,
                        body: { error: messages[result.reason] },
                    };
                }
                await revalidateAfterDomainChange(
                    (req as any).teamId,
                    previous?.customDomain
                        ? [previous.customDomain.hostname]
                        : [],
                );
                return {
                    status: 200,
                    body: toPublicSettings(
                        (await getDomainSettings((req as any).teamId))!,
                    ),
                };
            },
            verifyCustomDomain: async ({ req }) => {
                const updated = await verifyCustomDomain((req as any).teamId);
                if (!updated)
                    return {
                        status: 404,
                        body: { error: "No custom domain attached" },
                    };
                await revalidateAfterDomainChange((req as any).teamId);
                return {
                    status: 200,
                    body: toPublicSettings(
                        (await getDomainSettings((req as any).teamId))!,
                    ),
                };
            },
            removeCustomDomain: async ({ req }) => {
                const previous = await getDomainSettings((req as any).teamId);
                const removed = await removeCustomDomain((req as any).teamId);
                if (!removed)
                    return {
                        status: 404,
                        body: { error: "No custom domain attached" },
                    };
                await revalidateAfterDomainChange(
                    (req as any).teamId,
                    previous?.customDomain
                        ? [previous.customDomain.hostname]
                        : [],
                );
                return {
                    status: 200,
                    body: toPublicSettings(
                        (await getDomainSettings((req as any).teamId))!,
                    ),
                };
            },
        },
        {
            get: "domains.get",
            setSubdomain: "domains.setSubdomain",
            setSubdomainPublic: "domains.setSubdomainPublic",
            attachCustomDomain: "domains.attachCustomDomain",
            verifyCustomDomain: "domains.verifyCustomDomain",
            removeCustomDomain: "domains.removeCustomDomain",
        },
    ),
);

createExpressEndpoints(contract.domains, impl, router);

export default router;
