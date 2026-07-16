import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { broadcastSchema, contactSchema, newsletterSettingsSchema, segmentSchema, successMessageSchema } from "@frontlit/api-contract";
import { getSendlitApiKey } from "../../integrations/queries";
import {
    addContactTag,
    createBroadcast,
    createSegment,
    deleteContact,
    deleteSegment,
    getBroadcastStats,
    getContact,
    getGeneralSettings,
    listBroadcasts,
    listContacts,
    listSegments,
    removeContactTag,
    sendBroadcast,
    updateBroadcast,
    updateGeneralSettings,
    updateSegment,
} from "../../newsletter/sendlit-client";
import { AUTH_ERROR, errorResult, INTERNAL_ERROR, NOT_FOUND, jsonResult } from "./responses";
import { getTeamId } from "./auth";

const NOT_CONNECTED_ERROR = errorResult("SendLit is not connected for this team yet.");

function toBroadcast(item: { sequenceId: string; name: string; status: string; subject?: string; body?: Record<string, unknown>; createdAt?: string }) {
    return { broadcastId: item.sequenceId, name: item.name, status: item.status, subject: item.subject, body: item.body, createdAt: item.createdAt };
}

/** All tools proxy the team's provisioned SendLit team \u2014 FrontLit has no
 * local contact/segment/broadcast data (architecture.md \u00a710). */
export function registerNewsletterTools(server: McpServer): void {
    server.registerTool(
        "get_newsletter_settings",
        {
            description: "Gets the current team's newsletter (SendLit sender identity) settings.",
            inputSchema: {},
            outputSchema: newsletterSettingsSchema,
            annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
        },
        async (_args: any, extra: any) => {
            const teamId = getTeamId(extra);
            if (!teamId) return AUTH_ERROR;
            const apiKey = await getSendlitApiKey(teamId);
            if (!apiKey) return jsonResult({ connected: false });
            try {
                return jsonResult({ connected: true, ...(await getGeneralSettings(apiKey)) });
            } catch {
                return jsonResult({ connected: true });
            }
        },
    );

    server.registerTool(
        "update_newsletter_settings",
        {
            description: "Updates the current team's newsletter sender identity (from name/email, reply-to).",
            inputSchema: { fromName: z.string().optional(), fromEmail: z.string().optional(), replyTo: z.string().optional() },
            outputSchema: newsletterSettingsSchema,
            annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
        },
        async (args: any, extra: any) => {
            const teamId = getTeamId(extra);
            if (!teamId) return AUTH_ERROR;
            const apiKey = await getSendlitApiKey(teamId);
            if (!apiKey) return NOT_CONNECTED_ERROR;
            try {
                return jsonResult({ connected: true, ...(await updateGeneralSettings(apiKey, args)) });
            } catch {
                return INTERNAL_ERROR;
            }
        },
    );

    server.registerTool(
        "list_contacts",
        {
            description: "Lists the current team's SendLit contacts, optionally filtered by email, tag, or subscription state.",
            inputSchema: { email: z.string().optional(), tag: z.string().optional(), subscribed: z.boolean().optional() },
            outputSchema: z.object({ items: z.array(contactSchema), total: z.number() }),
            annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
        },
        async (args: any, extra: any) => {
            const teamId = getTeamId(extra);
            if (!teamId) return AUTH_ERROR;
            const apiKey = await getSendlitApiKey(teamId);
            if (!apiKey) return NOT_CONNECTED_ERROR;
            try {
                return jsonResult(await listContacts(apiKey, args));
            } catch {
                return INTERNAL_ERROR;
            }
        },
    );

    server.registerTool(
        "get_contact",
        {
            description: "Fetches a single SendLit contact by id.",
            inputSchema: { contactId: z.string() },
            outputSchema: contactSchema,
            annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
        },
        async (args: any, extra: any) => {
            const teamId = getTeamId(extra);
            if (!teamId) return AUTH_ERROR;
            const apiKey = await getSendlitApiKey(teamId);
            if (!apiKey) return NOT_CONNECTED_ERROR;
            try {
                return jsonResult(await getContact(apiKey, args.contactId));
            } catch {
                return NOT_FOUND;
            }
        },
    );

    server.registerTool(
        "delete_contact",
        {
            description: "Permanently deletes a SendLit contact (GDPR erasure).",
            inputSchema: { contactId: z.string() },
            outputSchema: successMessageSchema,
            annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
        },
        async (args: any, extra: any) => {
            const teamId = getTeamId(extra);
            if (!teamId) return AUTH_ERROR;
            const apiKey = await getSendlitApiKey(teamId);
            if (!apiKey) return NOT_CONNECTED_ERROR;
            try {
                await deleteContact(apiKey, args.contactId);
                return jsonResult({ message: "Contact deleted." });
            } catch {
                return INTERNAL_ERROR;
            }
        },
    );

    server.registerTool(
        "add_contact_tag",
        {
            description: "Adds a tag to a SendLit contact.",
            inputSchema: { contactId: z.string(), tag: z.string().min(1) },
            outputSchema: contactSchema,
            annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
        },
        async (args: any, extra: any) => {
            const teamId = getTeamId(extra);
            if (!teamId) return AUTH_ERROR;
            const apiKey = await getSendlitApiKey(teamId);
            if (!apiKey) return NOT_CONNECTED_ERROR;
            try {
                return jsonResult(await addContactTag(apiKey, args.contactId, args.tag));
            } catch {
                return INTERNAL_ERROR;
            }
        },
    );

    server.registerTool(
        "remove_contact_tag",
        {
            description: "Removes a tag from a SendLit contact.",
            inputSchema: { contactId: z.string(), tag: z.string().min(1) },
            outputSchema: contactSchema,
            annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
        },
        async (args: any, extra: any) => {
            const teamId = getTeamId(extra);
            if (!teamId) return AUTH_ERROR;
            const apiKey = await getSendlitApiKey(teamId);
            if (!apiKey) return NOT_CONNECTED_ERROR;
            try {
                return jsonResult(await removeContactTag(apiKey, args.contactId, args.tag));
            } catch {
                return INTERNAL_ERROR;
            }
        },
    );

    server.registerTool(
        "list_segments",
        {
            description: "Lists the current team's saved SendLit segments.",
            inputSchema: {},
            outputSchema: z.object({ items: z.array(segmentSchema) }),
            annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
        },
        async (_args: any, extra: any) => {
            const teamId = getTeamId(extra);
            if (!teamId) return AUTH_ERROR;
            const apiKey = await getSendlitApiKey(teamId);
            if (!apiKey) return NOT_CONNECTED_ERROR;
            try {
                return jsonResult(await listSegments(apiKey));
            } catch {
                return INTERNAL_ERROR;
            }
        },
    );

    server.registerTool(
        "create_segment",
        {
            description: "Creates a saved SendLit segment from filter conditions.",
            inputSchema: { name: z.string().min(1), conditions: z.array(z.record(z.any())).default([]) },
            outputSchema: segmentSchema,
            annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
        },
        async (args: any, extra: any) => {
            const teamId = getTeamId(extra);
            if (!teamId) return AUTH_ERROR;
            const apiKey = await getSendlitApiKey(teamId);
            if (!apiKey) return NOT_CONNECTED_ERROR;
            try {
                return jsonResult(await createSegment(apiKey, args));
            } catch {
                return INTERNAL_ERROR;
            }
        },
    );

    server.registerTool(
        "update_segment",
        {
            description: "Updates a saved SendLit segment.",
            inputSchema: { segmentId: z.string(), name: z.string().optional(), conditions: z.array(z.record(z.any())).optional() },
            outputSchema: segmentSchema,
            annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
        },
        async (args: any, extra: any) => {
            const teamId = getTeamId(extra);
            if (!teamId) return AUTH_ERROR;
            const apiKey = await getSendlitApiKey(teamId);
            if (!apiKey) return NOT_CONNECTED_ERROR;
            try {
                const { segmentId, ...patch } = args;
                return jsonResult(await updateSegment(apiKey, segmentId, patch));
            } catch {
                return NOT_FOUND;
            }
        },
    );

    server.registerTool(
        "delete_segment",
        {
            description: "Deletes a saved SendLit segment.",
            inputSchema: { segmentId: z.string() },
            outputSchema: successMessageSchema,
            annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
        },
        async (args: any, extra: any) => {
            const teamId = getTeamId(extra);
            if (!teamId) return AUTH_ERROR;
            const apiKey = await getSendlitApiKey(teamId);
            if (!apiKey) return NOT_CONNECTED_ERROR;
            try {
                await deleteSegment(apiKey, args.segmentId);
                return jsonResult({ message: "Segment deleted." });
            } catch {
                return NOT_FOUND;
            }
        },
    );

    server.registerTool(
        "list_broadcasts",
        {
            description: "Lists the current team's SendLit broadcasts (newsletter sends).",
            inputSchema: {},
            outputSchema: z.object({ items: z.array(broadcastSchema) }),
            annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
        },
        async (_args: any, extra: any) => {
            const teamId = getTeamId(extra);
            if (!teamId) return AUTH_ERROR;
            const apiKey = await getSendlitApiKey(teamId);
            if (!apiKey) return NOT_CONNECTED_ERROR;
            try {
                const { items } = await listBroadcasts(apiKey);
                return jsonResult({ items: items.map(toBroadcast) });
            } catch {
                return INTERNAL_ERROR;
            }
        },
    );

    server.registerTool(
        "create_broadcast",
        {
            description: "Creates a draft broadcast (newsletter send).",
            inputSchema: { name: z.string().min(1), subject: z.string().optional() },
            outputSchema: broadcastSchema,
            annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
        },
        async (args: any, extra: any) => {
            const teamId = getTeamId(extra);
            if (!teamId) return AUTH_ERROR;
            const apiKey = await getSendlitApiKey(teamId);
            if (!apiKey) return NOT_CONNECTED_ERROR;
            try {
                return jsonResult(toBroadcast(await createBroadcast(apiKey, args)));
            } catch {
                return INTERNAL_ERROR;
            }
        },
    );

    server.registerTool(
        "update_broadcast",
        {
            description: "Updates a draft broadcast's name or subject.",
            inputSchema: { broadcastId: z.string(), name: z.string().optional(), subject: z.string().optional() },
            outputSchema: broadcastSchema,
            annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
        },
        async (args: any, extra: any) => {
            const teamId = getTeamId(extra);
            if (!teamId) return AUTH_ERROR;
            const apiKey = await getSendlitApiKey(teamId);
            if (!apiKey) return NOT_CONNECTED_ERROR;
            try {
                const { broadcastId, ...patch } = args;
                return jsonResult(toBroadcast(await updateBroadcast(apiKey, broadcastId, patch)));
            } catch {
                return NOT_FOUND;
            }
        },
    );

    server.registerTool(
        "send_broadcast",
        {
            description: "Sends a broadcast to its audience.",
            inputSchema: { broadcastId: z.string() },
            outputSchema: z.object({ status: z.string() }),
            annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
        },
        async (args: any, extra: any) => {
            const teamId = getTeamId(extra);
            if (!teamId) return AUTH_ERROR;
            const apiKey = await getSendlitApiKey(teamId);
            if (!apiKey) return NOT_CONNECTED_ERROR;
            try {
                return jsonResult(await sendBroadcast(apiKey, args.broadcastId));
            } catch {
                return NOT_FOUND;
            }
        },
    );

    server.registerTool(
        "get_broadcast_stats",
        {
            description: "Gets delivery/open/click stats for a broadcast.",
            inputSchema: { broadcastId: z.string() },
            outputSchema: z.record(z.any()),
            annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
        },
        async (args: any, extra: any) => {
            const teamId = getTeamId(extra);
            if (!teamId) return AUTH_ERROR;
            const apiKey = await getSendlitApiKey(teamId);
            if (!apiKey) return NOT_CONNECTED_ERROR;
            try {
                return jsonResult(await getBroadcastStats(apiKey, args.broadcastId));
            } catch {
                return NOT_FOUND;
            }
        },
    );
}
