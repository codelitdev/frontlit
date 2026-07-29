import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { teamSettingsSchema } from "@frontlit/api-contract";
import { getTeamSettings, updateTeamSettings } from "../../settings/queries";
import { getTeamMembership } from "../../team/queries";
import {
    AUTH_ERROR,
    INTERNAL_ERROR,
    errorResult,
    jsonResult,
} from "./responses";
import { getAuthAccount, getTeamId } from "./auth";
import { omitInternal, serializeDates } from "../../utils/public";

function toPublicSettings<T extends Record<string, unknown>>(settings: T) {
    return serializeDates(omitInternal(settings, "teamId"));
}

export function registerSettingsTools(server: McpServer): void {
    server.registerTool(
        "get_team_settings",
        {
            description:
                "Gets the current team's branding (title, subtitle, logo) and code-injection settings.",
            inputSchema: {},
            outputSchema: teamSettingsSchema,
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
                return jsonResult(
                    toPublicSettings(await getTeamSettings(teamId)),
                );
            } catch {
                return INTERNAL_ERROR;
            }
        },
    );

    server.registerTool(
        "update_team_settings",
        {
            description:
                "Updates the current team's branding and/or code-injection settings. Editing code injection requires the caller to hold the team owner role (session auth only) — it's arbitrary script on the team's own public site.",
            inputSchema: {
                title: z.string().max(200).optional(),
                subtitle: z.string().max(500).optional(),
                logo: z.record(z.any()).nullable().optional(),
                codeInjectionHead: z.string().max(16_384).nullable().optional(),
                codeInjectionBody: z.string().max(16_384).nullable().optional(),
            },
            outputSchema: teamSettingsSchema,
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
                const editsInjection =
                    args.codeInjectionHead !== undefined ||
                    args.codeInjectionBody !== undefined;
                const account = getAuthAccount(extra);
                if (editsInjection && account) {
                    const membership = await getTeamMembership(
                        teamId,
                        account.id,
                    );
                    if (membership?.role !== "owner")
                        return errorResult(
                            "Only the team owner can edit code injection",
                        );
                }
                return jsonResult(
                    toPublicSettings(await updateTeamSettings(teamId, args)),
                );
            } catch {
                return INTERNAL_ERROR;
            }
        },
    );
}
