import type { McpToolRegistrar } from "../tool-registry";
import { z } from "zod";
import { domainSettingsSchema } from "@frontlit/api-contract";
import {
  attachCustomDomain,
  getDomainSettings,
  removeCustomDomain,
  setSubdomainPublic,
  setTeamSubdomain,
  verifyCustomDomain,
} from "../../domains/queries";
import { revalidateAfterDomainChange } from "../../domains/revalidate";
import { AUTH_ERROR, INTERNAL_ERROR, errorResult, jsonResult } from "./responses";
import { getTeamId } from "./auth";

function toPublicSettings(
  settings: NonNullable<Awaited<ReturnType<typeof getDomainSettings>>>,
) {
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

export function registerDomainTools(server: McpToolRegistrar): void {
  server.registerTool(
    "get_domain_settings",
    {
      description:
        "Gets the current team's domain settings: default subdomain, optional custom domain, whether the subdomain is public, and DNS verification records while a custom domain is attached.",
      inputSchema: {},
      outputSchema: domainSettingsSchema,
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (_args: any, extra: any) => {
      const teamId = getTeamId(extra);
      if (!teamId) return AUTH_ERROR;
      try {
        const settings = await getDomainSettings(teamId);
        return settings
          ? jsonResult(toPublicSettings(settings))
          : errorResult("Team not found");
      } catch {
        return INTERNAL_ERROR;
      }
    },
  );

  server.registerTool(
    "set_team_subdomain",
    {
      description:
        "Changes the current team's default `<slug>.<PLATFORM_SITE_DOMAIN>` subdomain.",
      inputSchema: { slug: z.string().min(1).max(63) },
      outputSchema: domainSettingsSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async (args: any, extra: any) => {
      const teamId = getTeamId(extra);
      if (!teamId) return AUTH_ERROR;
      try {
        const previous = await getDomainSettings(teamId);
        const result = await setTeamSubdomain(teamId, args.slug);
        if (!result.ok)
          return errorResult(
            result.reason === "reserved"
              ? "That subdomain is reserved"
              : "That subdomain is already taken",
          );
        await revalidateAfterDomainChange(
          teamId,
          previous?.subdomain ? [previous.subdomain.hostname] : [],
        );
        return jsonResult(toPublicSettings((await getDomainSettings(teamId))!));
      } catch {
        return INTERNAL_ERROR;
      }
    },
  );

  server.registerTool(
    "set_subdomain_public",
    {
      description:
        "Shows or hides the current team's FrontLit subdomain. Hide is not a redirect — resolve-host treats the subdomain as an unknown host. Requires a verified custom domain.",
      inputSchema: { subdomainPublic: z.boolean() },
      outputSchema: domainSettingsSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async (args: any, extra: any) => {
      const teamId = getTeamId(extra);
      if (!teamId) return AUTH_ERROR;
      try {
        const result = await setSubdomainPublic(teamId, args.subdomainPublic);
        if (!result.ok)
          return errorResult(
            "A verified custom domain is required to hide the FrontLit subdomain",
          );
        await revalidateAfterDomainChange(teamId);
        return jsonResult(toPublicSettings((await getDomainSettings(teamId))!));
      } catch {
        return INTERNAL_ERROR;
      }
    },
  );

  server.registerTool(
    "attach_custom_domain",
    {
      description:
        "Attaches a custom domain to the current team and starts DNS verification. One custom domain per team — remove the existing one first.",
      inputSchema: { hostname: z.string().min(1) },
      outputSchema: domainSettingsSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async (args: any, extra: any) => {
      const teamId = getTeamId(extra);
      if (!teamId) return AUTH_ERROR;
      try {
        const result = await attachCustomDomain(teamId, args.hostname);
        if (!result.ok) return errorResult(result.reason);
        await revalidateAfterDomainChange(teamId);
        return jsonResult(toPublicSettings((await getDomainSettings(teamId))!));
      } catch {
        return INTERNAL_ERROR;
      }
    },
  );

  server.registerTool(
    "verify_custom_domain",
    {
      description:
        "Re-checks ownership TXT and routing DNS for the current team's attached custom domain. Status becomes verified only when both pass.",
      inputSchema: {},
      outputSchema: domainSettingsSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (_args: any, extra: any) => {
      const teamId = getTeamId(extra);
      if (!teamId) return AUTH_ERROR;
      try {
        const updated = await verifyCustomDomain(teamId);
        if (!updated) return errorResult("No custom domain attached");
        await revalidateAfterDomainChange(teamId);
        return jsonResult(toPublicSettings((await getDomainSettings(teamId))!));
      } catch {
        return INTERNAL_ERROR;
      }
    },
  );

  server.registerTool(
    "remove_custom_domain",
    {
      description:
        "Removes the current team's custom domain and re-enables the FrontLit subdomain.",
      inputSchema: {},
      outputSchema: domainSettingsSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        openWorldHint: false,
      },
    },
    async (_args: any, extra: any) => {
      const teamId = getTeamId(extra);
      if (!teamId) return AUTH_ERROR;
      try {
        const previous = await getDomainSettings(teamId);
        const removed = await removeCustomDomain(teamId);
        if (!removed) return errorResult("No custom domain attached");
        await revalidateAfterDomainChange(
          teamId,
          previous?.customDomain ? [previous.customDomain.hostname] : [],
        );
        return jsonResult(toPublicSettings((await getDomainSettings(teamId))!));
      } catch {
        return INTERNAL_ERROR;
      }
    },
  );
}
