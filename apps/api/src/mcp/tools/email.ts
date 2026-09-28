import type { McpToolRegistrar } from "../tool-registry";
import { z } from "zod";
import {
  broadcastSchema,
  contactSchema,
  espConfigSchema,
  espProviderSchema,
  emailSettingsSchema,
  segmentSchema,
  successMessageSchema,
} from "@frontlit/api-contract";
import { getSendlitApiKey } from "../../integrations/queries";
import {
  addContactTag,
  createBroadcast,
  createSegment,
  upsertContact,
  deleteBroadcast,
  deleteContact,
  deleteEspConfig,
  deleteSegment,
  getBroadcastStats,
  getContact,
  getEspConfig,
  getGeneralSettings,
  listBroadcasts,
  listContacts,
  listSegments,
  removeContactTag,
  sendBroadcast,
  testEspConfig,
  toBroadcast,
  updateBroadcast,
  updateGeneralSettings,
  upsertEspConfig,
  updateSegment,
} from "../../email/sendlit-client";
import {
  AUTH_ERROR,
  errorResult,
  INTERNAL_ERROR,
  NOT_FOUND,
  jsonResult,
} from "./responses";
import { getTeamId } from "./auth";

const NOT_CONNECTED_ERROR = errorResult(
  "Configure the email delivery connection in Settings first.",
);

/** All tools proxy the team's provisioned SendLit team \u2014 FrontLit has no
 * local contact/segment/broadcast data (architecture.md \u00a710). */
export function registerEmailTools(server: McpToolRegistrar): void {
  server.registerTool(
    "get_email_settings",
    {
      description: "Gets the current team's SendLit compliance settings.",
      inputSchema: {},
      outputSchema: emailSettingsSchema,
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (_args: any, extra: any) => {
      const teamId = getTeamId(extra);
      if (!teamId) return AUTH_ERROR;
      const apiKey = await getSendlitApiKey(teamId);
      if (!apiKey) return jsonResult({ connected: false });
      try {
        return jsonResult({
          connected: true,
          ...(await getGeneralSettings(apiKey)),
        });
      } catch {
        return jsonResult({ connected: true });
      }
    },
  );

  server.registerTool(
    "update_email_settings",
    {
      description:
        "Updates the physical mailing address SendLit requires in marketing email footers.",
      inputSchema: { mailingAddress: z.string().optional() },
      outputSchema: emailSettingsSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: true,
      },
    },
    async (args: any, extra: any) => {
      const teamId = getTeamId(extra);
      if (!teamId) return AUTH_ERROR;
      const apiKey = await getSendlitApiKey(teamId);
      if (!apiKey) return NOT_CONNECTED_ERROR;
      try {
        return jsonResult({
          connected: true,
          ...(await updateGeneralSettings(apiKey, args)),
        });
      } catch {
        return INTERNAL_ERROR;
      }
    },
  );

  server.registerTool(
    "get_esp_config",
    {
      description:
        "Gets the current team's default SendLit email service provider configuration. Credentials are never returned.",
      inputSchema: {},
      outputSchema: z.object({
        configured: z.boolean(),
        config: espConfigSchema.nullable(),
      }),
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (_args: any, extra: any) => {
      const teamId = getTeamId(extra);
      if (!teamId) return AUTH_ERROR;
      const apiKey = await getSendlitApiKey(teamId);
      if (!apiKey) return NOT_CONNECTED_ERROR;
      try {
        const config = await getEspConfig(apiKey);
        return jsonResult({ configured: Boolean(config), config });
      } catch {
        return INTERNAL_ERROR;
      }
    },
  );

  server.registerTool(
    "update_esp_config",
    {
      description:
        "Creates or updates the current team's default SendLit ESP. Omit password to retain the stored secret.",
      inputSchema: {
        provider: espProviderSchema,
        host: z.string().min(1),
        port: z.number().int().min(1).max(65535),
        secure: z.boolean(),
        username: z.string().optional(),
        password: z.string().optional(),
        fromName: z.string().optional(),
        fromEmail: z.string().email().optional(),
      },
      outputSchema: espConfigSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: true,
      },
    },
    async (args: any, extra: any) => {
      const teamId = getTeamId(extra);
      if (!teamId) return AUTH_ERROR;
      const apiKey = await getSendlitApiKey(teamId);
      if (!apiKey) return NOT_CONNECTED_ERROR;
      try {
        return jsonResult(await upsertEspConfig(apiKey, args));
      } catch {
        return INTERNAL_ERROR;
      }
    },
  );

  server.registerTool(
    "test_esp_config",
    {
      description:
        "Sends a real test email through the current team's configured SendLit ESP.",
      inputSchema: { to: z.string().email() },
      outputSchema: z.object({
        success: z.boolean(),
        error: z.string().optional(),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: true,
      },
    },
    async (args: any, extra: any) => {
      const teamId = getTeamId(extra);
      if (!teamId) return AUTH_ERROR;
      const apiKey = await getSendlitApiKey(teamId);
      if (!apiKey) return NOT_CONNECTED_ERROR;
      try {
        return jsonResult(await testEspConfig(apiKey, args.to));
      } catch {
        return INTERNAL_ERROR;
      }
    },
  );

  server.registerTool(
    "remove_esp_config",
    {
      description:
        "Removes the current team's default SendLit ESP. Email sending will stop until another ESP is configured.",
      inputSchema: {},
      outputSchema: successMessageSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        openWorldHint: true,
      },
    },
    async (_args: any, extra: any) => {
      const teamId = getTeamId(extra);
      if (!teamId) return AUTH_ERROR;
      const apiKey = await getSendlitApiKey(teamId);
      if (!apiKey) return NOT_CONNECTED_ERROR;
      try {
        await deleteEspConfig(apiKey);
        return jsonResult({ message: "ESP configuration removed." });
      } catch {
        return INTERNAL_ERROR;
      }
    },
  );

  server.registerTool(
    "list_contacts",
    {
      description:
        "Lists the current team's SendLit contacts, optionally filtered by email, tag, subscription state, or a SendLit audience filter.",
      inputSchema: {
        email: z.string().optional(),
        tag: z.string().optional(),
        subscribed: z.boolean().optional(),
        q: z.string().optional(),
        segmentId: z.string().optional(),
        filter: z.string().optional(),
      },
      outputSchema: z.object({
        items: z.array(contactSchema),
        total: z.number(),
      }),
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
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
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
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
    "create_contact",
    {
      description:
        "Creates a SendLit contact. If the email already exists on the team, the existing contact is returned.",
      inputSchema: {
        email: z.string().email(),
        name: z.string().optional(),
        tags: z.array(z.string().min(1)).optional(),
      },
      outputSchema: contactSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: true,
      },
    },
    async (args: any, extra: any) => {
      const teamId = getTeamId(extra);
      if (!teamId) return AUTH_ERROR;
      const apiKey = await getSendlitApiKey(teamId);
      if (!apiKey) return NOT_CONNECTED_ERROR;
      try {
        return jsonResult(
          await upsertContact(apiKey, {
            email: args.email,
            name: args.name,
            tags: args.tags,
          }),
        );
      } catch {
        return INTERNAL_ERROR;
      }
    },
  );

  server.registerTool(
    "delete_contact",
    {
      description: "Permanently deletes a SendLit contact (GDPR erasure).",
      inputSchema: { contactId: z.string() },
      outputSchema: successMessageSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        openWorldHint: true,
      },
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
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: true,
      },
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
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        openWorldHint: true,
      },
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
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
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
      description:
        "Creates a saved SendLit segment from a ContactFilterBuilder audience filter.",
      inputSchema: {
        name: z.string().min(1),
        filter: z.object({
          aggregator: z.enum(["and", "or"]),
          filters: z.array(z.record(z.any())),
        }),
      },
      outputSchema: segmentSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: true,
      },
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
      inputSchema: {
        segmentId: z.string(),
        name: z.string().optional(),
        filter: z
          .object({
            aggregator: z.enum(["and", "or"]),
            filters: z.array(z.record(z.any())),
          })
          .optional(),
      },
      outputSchema: segmentSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: true,
      },
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
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        openWorldHint: true,
      },
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
      description: "Lists the current team's SendLit broadcasts (email sends).",
      inputSchema: {},
      outputSchema: z.object({ items: z.array(broadcastSchema) }),
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
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
      description: "Creates a draft email broadcast.",
      inputSchema: {
        name: z.string().min(1),
        subject: z.string().optional(),
      },
      outputSchema: broadcastSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: true,
      },
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
      description: "Updates a draft broadcast's name, subject, or audience filter.",
      inputSchema: {
        broadcastId: z.string(),
        name: z.string().optional(),
        subject: z.string().optional(),
        filter: z
          .object({
            aggregator: z.enum(["and", "or"]),
            filters: z.array(z.record(z.any())),
          })
          .nullable()
          .optional(),
      },
      outputSchema: broadcastSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: true,
      },
    },
    async (args: any, extra: any) => {
      const teamId = getTeamId(extra);
      if (!teamId) return AUTH_ERROR;
      const apiKey = await getSendlitApiKey(teamId);
      if (!apiKey) return NOT_CONNECTED_ERROR;
      try {
        const { broadcastId, ...patch } = args;
        return jsonResult(
          toBroadcast(await updateBroadcast(apiKey, broadcastId, patch)),
        );
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
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        openWorldHint: true,
      },
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
    "delete_broadcast",
    {
      description: "Deletes a SendLit broadcast.",
      inputSchema: { broadcastId: z.string() },
      outputSchema: successMessageSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        openWorldHint: true,
      },
    },
    async (args: any, extra: any) => {
      const teamId = getTeamId(extra);
      if (!teamId) return AUTH_ERROR;
      const apiKey = await getSendlitApiKey(teamId);
      if (!apiKey) return NOT_CONNECTED_ERROR;
      try {
        await deleteBroadcast(apiKey, args.broadcastId);
        return jsonResult({ message: "Broadcast deleted." });
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
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
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
