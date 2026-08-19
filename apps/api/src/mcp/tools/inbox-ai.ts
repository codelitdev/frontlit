import type { McpToolRegistrar } from "../tool-registry";
import {
    inboxAiPolicyPatchSchema,
    inboxAiSettingsSchema,
} from "@frontlit/api-contract";
import { AUTH_ERROR, jsonResult } from "./responses";
import { getTeamId } from "./auth";
import { getFrontLitMcpAuthInfo } from "../auth-context";
import { InboxAiPolicyError, upsertInboxAiPolicy } from "../../inbox-ai/policy";
import { isAiConfigured } from "../../inbox-ai/routes";
import { listInboxAiPolicies } from "../../inbox-ai/policy";
import { serializeDates } from "../../utils/public";

function toPublic(
    policy: Awaited<ReturnType<typeof listInboxAiPolicies>>[number],
) {
    return serializeDates({
        ...policy,
        createdAt: policy.createdAt.getTime() === 0 ? null : policy.createdAt,
        updatedAt: policy.updatedAt.getTime() === 0 ? null : policy.updatedAt,
    });
}

export function registerInboxAiTools(server: McpToolRegistrar): void {
    server.registerTool(
        "get_inbox_ai_settings",
        {
            description:
                "Gets Chatbot and Tickets inbox AI auto-reply policy for the current team.",
            inputSchema: {},
            outputSchema: inboxAiSettingsSchema,
            annotations: {
                readOnlyHint: true,
                idempotentHint: true,
                openWorldHint: false,
            },
        },
        async (_args: any, extra: any) => {
            const teamId = getTeamId(extra);
            if (!teamId) return AUTH_ERROR;
            const auth = getFrontLitMcpAuthInfo(extra)?.extra;
            const policies = await listInboxAiPolicies(teamId);
            const permissions: string[] = auth?.permissions ?? [];
            const owner = auth?.isOwner === true;
            const channels: Record<string, unknown> = {};
            for (const policy of policies) {
                const allowed =
                    owner ||
                    (policy.channel === "chatbot"
                        ? permissions.includes("chatbot:read")
                        : permissions.includes("helpdesk:read"));
                if (allowed) channels[policy.channel] = toPublic(policy);
            }
            return jsonResult({
                aiConfigured: await isAiConfigured(teamId),
                channels,
            });
        },
    );

    server.registerTool(
        "update_inbox_ai_settings",
        {
            description:
                "Updates Chatbot and/or Tickets inbox AI auto-reply policy.",
            inputSchema: {
                chatbot: inboxAiPolicyPatchSchema.optional(),
                tickets: inboxAiPolicyPatchSchema.optional(),
            },
            outputSchema: inboxAiSettingsSchema,
            annotations: {
                readOnlyHint: false,
                destructiveHint: false,
                openWorldHint: false,
            },
        },
        async (args: any, extra: any) => {
            const teamId = getTeamId(extra);
            if (!teamId) return AUTH_ERROR;
            const auth = getFrontLitMcpAuthInfo(extra)?.extra;
            const permissions: string[] = auth?.permissions ?? [];
            const owner = auth?.isOwner === true;
            if (
                args.chatbot &&
                !owner &&
                !permissions.includes("chatbot:write")
            ) {
                return {
                    isError: true,
                    content: [
                        {
                            type: "text",
                            text: "insufficient_permission: chatbot:write is required.",
                        },
                    ],
                };
            }
            if (
                args.tickets &&
                !owner &&
                !permissions.includes("helpdesk:write")
            ) {
                return {
                    isError: true,
                    content: [
                        {
                            type: "text",
                            text: "insufficient_permission: helpdesk:write is required.",
                        },
                    ],
                };
            }
            if (!args.chatbot && !args.tickets) {
                return {
                    isError: true,
                    content: [
                        {
                            type: "text",
                            text: "At least one channel is required.",
                        },
                    ],
                };
            }
            try {
                const configured = await isAiConfigured(teamId);
                if (
                    (args.chatbot?.autoReply === true ||
                        args.tickets?.autoReply === true) &&
                    !configured
                ) {
                    return {
                        isError: true,
                        content: [
                            {
                                type: "text",
                                text: "ai_required: configure AI before enabling auto-reply.",
                            },
                        ],
                    };
                }
                if (args.chatbot) {
                    await upsertInboxAiPolicy(teamId, "chatbot", args.chatbot);
                }
                if (args.tickets) {
                    await upsertInboxAiPolicy(teamId, "tickets", args.tickets);
                }
            } catch (error) {
                if (error instanceof InboxAiPolicyError) {
                    return {
                        isError: true,
                        content: [{ type: "text", text: error.message }],
                    };
                }
                throw error;
            }
            const policies = await listInboxAiPolicies(teamId);
            const channels: Record<string, unknown> = {};
            for (const policy of policies) {
                const allowed =
                    owner ||
                    (policy.channel === "chatbot"
                        ? permissions.includes("chatbot:read")
                        : permissions.includes("helpdesk:read"));
                if (allowed) channels[policy.channel] = toPublic(policy);
            }
            return jsonResult({
                aiConfigured: await isAiConfigured(teamId),
                channels,
            });
        },
    );
}
