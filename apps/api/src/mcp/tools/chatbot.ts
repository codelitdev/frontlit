import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { chatResponseSchema, chatbotSettingsSchema } from "@frontlit/api-contract";
import { getChatbotSettings, updateChatbotSettings } from "../../chatbot/queries";
import { getChatAnswer } from "../../chatbot/completion";
import { searchChunks } from "../../documentation/queries";
import { AUTH_ERROR, INTERNAL_ERROR, jsonResult } from "./responses";
import { getTeamId } from "./auth";
import { omitInternal, serializeDates } from "../../utils/public";

function toPublicSettings<T extends Record<string, unknown>>(settings: T) {
    return serializeDates(omitInternal(settings, "teamId"));
}

export function registerChatbotTools(server: McpServer): void {
    server.registerTool(
        "get_chatbot_settings",
        {
            description: "Gets the current team's chatbot settings.",
            inputSchema: {},
            outputSchema: chatbotSettingsSchema,
            annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
        },
        async (_args: any, extra: any) => {
            const teamId = getTeamId(extra);
            if (!teamId) return AUTH_ERROR;
            try {
                const settings = await getChatbotSettings(teamId);
                return jsonResult(toPublicSettings(settings));
            } catch {
                return INTERNAL_ERROR;
            }
        },
    );

    server.registerTool(
        "update_chatbot_settings",
        {
            description: "Updates the current team's chatbot settings (enabled, name, greeting, accent color).",
            inputSchema: {
                enabled: z.boolean().optional(),
                name: z.string().optional(),
                greeting: z.string().optional(),
                accentColor: z.string().optional(),
            },
            outputSchema: chatbotSettingsSchema,
            annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
        },
        async (args: any, extra: any) => {
            const teamId = getTeamId(extra);
            if (!teamId) return AUTH_ERROR;
            try {
                const settings = await updateChatbotSettings(teamId, args);
                return jsonResult(toPublicSettings(settings));
            } catch {
                return INTERNAL_ERROR;
            }
        },
    );

    server.registerTool(
        "ask_docs",
        {
            description:
                "Asks a question and gets a non-streaming RAG answer grounded in the team's published help docs, with cited sources \u2014 lets an agent (or a customer's own support agent) answer from the vectorized docs without the web chat widget. Does not require the chatbot to be enabled for the team.",
            inputSchema: { question: z.string().min(1) },
            outputSchema: chatResponseSchema,
            annotations: { readOnlyHint: true, idempotentHint: false, openWorldHint: false },
        },
        async (args: any, extra: any) => {
            const teamId = getTeamId(extra);
            if (!teamId) return AUTH_ERROR;
            try {
                const chunks = await searchChunks(teamId, args.question);
                const { answer, sources } = await getChatAnswer(args.question, chunks);
                return jsonResult({ answer, sources });
            } catch {
                return INTERNAL_ERROR;
            }
        },
    );
}
