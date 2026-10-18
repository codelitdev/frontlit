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
  setPrimaryCustomDomain,
  setRedirectSubdomain,
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
    customDomains: settings.customDomains.map((host) => ({
      ...host,
      verifiedAt: host.verifiedAt?.toISOString() ?? null,
    })),
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
        const result = await setTeamSubdomain((req as any).teamId, body.slug);
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
          body: toPublicSettings((await getDomainSettings((req as any).teamId))!),
        };
      },
      setRedirectSubdomain: async ({ body, req }) => {
        await setRedirectSubdomain((req as any).teamId, body.redirectSubdomain);
        await revalidateAfterDomainChange((req as any).teamId);
        return {
          status: 200,
          body: toPublicSettings((await getDomainSettings((req as any).teamId))!),
        };
      },
      attachCustomDomain: async ({ body, req }) => {
        const previous = await getDomainSettings((req as any).teamId);
        const result = await attachCustomDomain((req as any).teamId, body.hostname);
        if (!result.ok) {
          const messages = {
            subdomain_required:
              "Choose a FrontLit subdomain before attaching a custom domain",
            reserved: "That hostname is reserved for default team subdomains",
            already_attached:
              "This team already has a custom domain attached — remove it first",
            taken:
              "That domain (or its www/apex pair) is already attached to another team",
          };
          return {
            status: 409,
            body: { error: messages[result.reason] },
          };
        }
        await revalidateAfterDomainChange(
          (req as any).teamId,
          previous?.customDomains.map((host) => host.hostname) ?? [],
        );
        return {
          status: 200,
          body: toPublicSettings((await getDomainSettings((req as any).teamId))!),
        };
      },
      setPrimaryCustomDomain: async ({ body, req }) => {
        const updated = await setPrimaryCustomDomain(
          (req as any).teamId,
          body.hostname,
        );
        if (!updated)
          return {
            status: 404,
            body: { error: "That host is not attached to this team" },
          };
        await revalidateAfterDomainChange((req as any).teamId);
        return {
          status: 200,
          body: toPublicSettings((await getDomainSettings((req as any).teamId))!),
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
          body: toPublicSettings((await getDomainSettings((req as any).teamId))!),
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
          previous?.customDomains.map((host) => host.hostname) ?? [],
        );
        return {
          status: 200,
          body: toPublicSettings((await getDomainSettings((req as any).teamId))!),
        };
      },
    },
    {
      get: "domains.get",
      setSubdomain: "domains.setSubdomain",
      setRedirectSubdomain: "domains.setRedirectSubdomain",
      attachCustomDomain: "domains.attachCustomDomain",
      setPrimaryCustomDomain: "domains.setPrimaryCustomDomain",
      verifyCustomDomain: "domains.verifyCustomDomain",
      removeCustomDomain: "domains.removeCustomDomain",
    },
  ),
);

createExpressEndpoints(contract.domains, impl, router);

export default router;
