import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { successMessageSchema, themeSchema } from "@frontlit/api-contract";
import {
    createTheme,
    deleteTheme,
    listThemes,
    updateTheme,
} from "../../themes/queries";
import { AUTH_ERROR, INTERNAL_ERROR, NOT_FOUND, jsonResult } from "./responses";
import { getTeamId } from "./auth";
import { omitInternal, serializeDates } from "../../utils/public";

function toPublicTheme(theme: Record<string, unknown>) {
    return serializeDates(omitInternal(theme, "teamId"));
}

export function registerThemeTools(server: McpServer): void {
    server.registerTool(
        "list_themes",
        {
            description: "Lists saved themes for the current team.",
            outputSchema: z.object({ items: z.array(themeSchema) }),
            annotations: {
                readOnlyHint: true,
                idempotentHint: true,
                openWorldHint: false,
            },
        },
        async (extra: any) => {
            const teamId = getTeamId(extra);
            if (!teamId) return AUTH_ERROR;
            try {
                const items = await listThemes(teamId);
                return jsonResult({ items: items.map(toPublicTheme) });
            } catch {
                return INTERNAL_ERROR;
            }
        },
    );

    server.registerTool(
        "create_theme",
        {
            description:
                "Saves a new named theme (colors/typography/structure) for reuse across pages.",
            inputSchema: { name: z.string().min(1), style: z.record(z.any()) },
            outputSchema: themeSchema,
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
                const theme = await createTheme({
                    teamId,
                    name: args.name,
                    style: args.style,
                });
                return jsonResult(toPublicTheme(theme));
            } catch {
                return INTERNAL_ERROR;
            }
        },
    );

    server.registerTool(
        "update_theme",
        {
            description: "Updates a saved theme's name and/or style.",
            inputSchema: {
                themeId: z.string(),
                name: z.string().optional(),
                style: z.record(z.any()).optional(),
            },
            outputSchema: themeSchema,
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
                const { themeId, ...patch } = args;
                const theme = await updateTheme(teamId, themeId, patch);
                if (!theme) return NOT_FOUND;
                return jsonResult(toPublicTheme(theme));
            } catch {
                return INTERNAL_ERROR;
            }
        },
    );

    server.registerTool(
        "delete_theme",
        {
            description: "Permanently deletes a saved theme.",
            inputSchema: { themeId: z.string() },
            outputSchema: successMessageSchema,
            annotations: {
                readOnlyHint: false,
                destructiveHint: true,
                openWorldHint: false,
            },
        },
        async (args: any, extra: any) => {
            const teamId = getTeamId(extra);
            if (!teamId) return AUTH_ERROR;
            try {
                await deleteTheme(teamId, args.themeId);
                return jsonResult({ message: "Theme deleted." });
            } catch {
                return INTERNAL_ERROR;
            }
        },
    );
}
