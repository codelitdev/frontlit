import type { McpToolRegistrar } from "../tool-registry";
import { z } from "zod";
import {
  chatbotSettingsSchema,
  chatbotWidgetStylePatchSchema,
  chatbotWidgetVariantSchema,
} from "@frontlit/api-contract";
import { getChatbotSettings, updateChatbotSettings } from "../../chatbot/queries";
import { AUTH_ERROR, INTERNAL_ERROR, jsonResult } from "./responses";
import { getTeamId } from "./auth";
import { omitInternal, serializeDates } from "../../utils/public";

function toPublicSettings<T extends Record<string, unknown>>(settings: T) {
  return serializeDates(omitInternal(settings, "teamId"));
}

export function registerChatbotTools(server: McpToolRegistrar): void {
  server.registerTool(
    "get_chatbot_settings",
    {
      description: "Gets the current team's chatbot settings.",
      inputSchema: {},
      outputSchema: chatbotSettingsSchema,
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
      description:
        "Updates the current team's chatbot settings (enabled, name, greeting, accent, escalation, launcher variant/styles).",
      inputSchema: {
        enabled: z.boolean().optional(),
        name: z.string().optional(),
        greeting: z.string().optional(),
        accentColor: z.string().nullable().optional(),
        escalationEnabled: z.boolean().optional(),
        variant: chatbotWidgetVariantSchema.optional(),
        widgetStyle: chatbotWidgetStylePatchSchema.optional(),
      },
      outputSchema: chatbotSettingsSchema,
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
        const settings = await updateChatbotSettings(teamId, args);
        return jsonResult(toPublicSettings(settings));
      } catch {
        return INTERNAL_ERROR;
      }
    },
  );
}
