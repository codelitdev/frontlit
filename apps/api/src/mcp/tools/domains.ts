import type { McpToolRegistrar } from "../tool-registry";
import { z } from "zod";
import { domainSettingsSchema } from "@frontlit/api-contract";
import {
  attachCustomDomain,
  getDomainSettings,
  removeCustomDomain,
  setPrimaryCustomDomain,
  setRedirectSubdomain,
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
    customDomains: settings.customDomains.map((host) => ({
      ...host,
      verifiedAt: host.verifiedAt?.toISOString() ?? null,
    })),
  };
}

export function registerDomainTools(server: McpToolRegistrar): void {
  server.registerTool(
    "get_domain_settings",
    {
      description:
        "Gets the current team's domain settings: default subdomain, the custom domain's hosts (an apex/www pair) with their per-host DNS records and status, the shared ownership TXT record, the canonical host, and whether the subdomain redirects to it.",
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
    "set_subdomain_redirect",
    {
      description:
        "Chooses whether the current team's FrontLit subdomain 301-redirects to the canonical custom host (default true). Only applies while a custom host is verified; false keeps the subdomain serving the site.",
      inputSchema: { redirectSubdomain: z.boolean() },
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
        await setRedirectSubdomain(teamId, args.redirectSubdomain);
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
        "Attaches a custom domain to the current team and starts DNS verification. An apex (`example.com`) or `www.` host also attaches the other half of the pair; the typed host starts as primary. One custom domain per team — remove the existing one first.",
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
    "set_primary_custom_domain",
    {
      description:
        "Chooses which of the current team's custom hosts is canonical. Once verified, every other host 301-redirects to it.",
      inputSchema: { hostname: z.string().min(1) },
      outputSchema: domainSettingsSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args: any, extra: any) => {
      const teamId = getTeamId(extra);
      if (!teamId) return AUTH_ERROR;
      try {
        const updated = await setPrimaryCustomDomain(teamId, args.hostname);
        if (!updated) return errorResult("That host is not attached to this team");
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
        "Re-checks the shared ownership TXT and each custom host's routing DNS. A host becomes verified when the TXT and its own routing record pass, so one half of a pair can be live while the other is pending.",
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
        "Removes the current team's custom domain (both hosts of the pair). The FrontLit subdomain becomes canonical again.",
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
          previous?.customDomains.map((host) => host.hostname) ?? [],
        );
        return jsonResult(toPublicSettings((await getDomainSettings(teamId))!));
      } catch {
        return INTERNAL_ERROR;
      }
    },
  );
}
