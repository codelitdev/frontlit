import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { domainSettingsSchema } from "@frontlit/api-contract";
import {
    attachCustomDomain,
    getDomainSettings,
    removeCustomDomain,
    setTeamSubdomain,
    verifyCustomDomain,
} from "../../domains/queries";
import {
    AUTH_ERROR,
    INTERNAL_ERROR,
    errorResult,
    jsonResult,
} from "./responses";
import { getTeamId } from "./auth";

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

export function registerDomainTools(server: McpServer): void {
    server.registerTool(
        "get_domain_settings",
        {
            description:
                "Gets the current team's domain settings: default subdomain, optional custom domain, and DNS verification records if pending.",
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
                const result = await setTeamSubdomain(teamId, args.slug);
                if (!result.ok)
                    return errorResult("That subdomain is already taken");
                return jsonResult(
                    toPublicSettings((await getDomainSettings(teamId))!),
                );
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
                return jsonResult(
                    toPublicSettings((await getDomainSettings(teamId))!),
                );
            } catch {
                return INTERNAL_ERROR;
            }
        },
    );

    server.registerTool(
        "verify_custom_domain",
        {
            description:
                "Re-checks DNS for the current team's attached custom domain and flips its status to verified on a match.",
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
                return jsonResult(
                    toPublicSettings((await getDomainSettings(teamId))!),
                );
            } catch {
                return INTERNAL_ERROR;
            }
        },
    );

    server.registerTool(
        "remove_custom_domain",
        {
            description:
                "Removes the current team's custom domain. Its permanent FrontLit subdomain remains available and canonical.",
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
                const removed = await removeCustomDomain(teamId);
                if (!removed) return errorResult("No custom domain attached");
                return jsonResult(
                    toPublicSettings((await getDomainSettings(teamId))!),
                );
            } catch {
                return INTERNAL_ERROR;
            }
        },
    );
}
