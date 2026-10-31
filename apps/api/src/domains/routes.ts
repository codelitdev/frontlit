import { Router } from "express";
import { createExpressEndpoints, initServer } from "@ts-rest/express";
import { contract } from "@frontlit/api-contract";
import { requireAuth } from "../auth/middleware";
import { requireTeam } from "../auth/require-team";
import { authorizeHandlers } from "../auth/authorize";
import {
  addRedirectDomain,
  attachCustomDomain,
  getDomainSettings,
  removeCustomDomain,
  removeRedirectDomain,
  setPrimaryCustomDomain,
  setRedirectSubdomain,
  setHideFromSearch,
  setTeamSubdomain,
  updateRedirectDomain,
  verifyCustomDomain,
  verifyRedirectDomain,
} from "./queries";
import { revalidateAfterDomainChange } from "./revalidate";
import { toPublicSettings } from "./public-settings";

const router = Router();
router.use("/domain", requireAuth, requireTeam);

const s = initServer();

async function settingsResponse(teamId: string) {
  return {
    status: 200 as const,
    body: toPublicSettings((await getDomainSettings(teamId))!),
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
      setHideFromSearch: async ({ body, req }) => {
        await setHideFromSearch((req as any).teamId, body.hideFromSearch);
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
      addRedirectDomain: async ({ body, req }) => {
        const teamId = (req as any).teamId;
        const result = await addRedirectDomain(teamId, body.hostname, body.pathPrefix);
        if (!result.ok) {
          const messages = {
            subdomain_required:
              "Choose a FrontLit subdomain before adding a redirect domain",
            reserved: "That hostname is reserved for default team subdomains",
            taken: "That domain is already in use as a custom or redirect domain",
          };
          return { status: 409, body: { error: messages[result.reason] } };
        }
        return settingsResponse(teamId);
      },
      updateRedirectDomain: async ({ params, body, req }) => {
        const teamId = (req as any).teamId;
        if (!(await updateRedirectDomain(teamId, params.hostname, body)))
          return { status: 404, body: { error: "That redirect domain is not added" } };
        await revalidateAfterDomainChange(teamId);
        return settingsResponse(teamId);
      },
      verifyRedirectDomain: async ({ params, req }) => {
        const teamId = (req as any).teamId;
        if (!(await verifyRedirectDomain(teamId, params.hostname)))
          return { status: 404, body: { error: "That redirect domain is not added" } };
        await revalidateAfterDomainChange(teamId);
        return settingsResponse(teamId);
      },
      removeRedirectDomain: async ({ params, req }) => {
        const teamId = (req as any).teamId;
        if (!(await removeRedirectDomain(teamId, params.hostname)))
          return { status: 404, body: { error: "That redirect domain is not added" } };
        await revalidateAfterDomainChange(teamId, [params.hostname]);
        return settingsResponse(teamId);
      },
    },
    {
      get: "domains.get",
      setSubdomain: "domains.setSubdomain",
      setRedirectSubdomain: "domains.setRedirectSubdomain",
      setHideFromSearch: "domains.setHideFromSearch",
      attachCustomDomain: "domains.attachCustomDomain",
      setPrimaryCustomDomain: "domains.setPrimaryCustomDomain",
      verifyCustomDomain: "domains.verifyCustomDomain",
      removeCustomDomain: "domains.removeCustomDomain",
      addRedirectDomain: "domains.addRedirectDomain",
      updateRedirectDomain: "domains.updateRedirectDomain",
      verifyRedirectDomain: "domains.verifyRedirectDomain",
      removeRedirectDomain: "domains.removeRedirectDomain",
    },
  ),
);

createExpressEndpoints(contract.domains, impl, router);

export default router;
