import type { McpToolRegistrar } from "../tool-registry";
import { z } from "zod";
import {
  createMediaBodySchema,
  mediaSchema,
  mediaUploadSignatureSchema,
  successMessageSchema,
} from "@frontlit/api-contract";
import {
  countMedia,
  deleteMediaRecord,
  getMediaByMediaId,
  listMedia,
  MediaError,
  registerMedia,
  updateMedia,
} from "../../media/queries";
import { getMediaUploadSignature } from "../../media/service";
import { AUTH_ERROR, INTERNAL_ERROR, NOT_FOUND, jsonResult } from "./responses";
import { getTeamId } from "./auth";
import { omitInternal, serializeDates } from "../../utils/public";

function toPublicMedia<T extends Record<string, unknown>>(item: T) {
  return serializeDates(omitInternal(item, "teamId"));
}

export function registerMediaTools(server: McpToolRegistrar): void {
  server.registerTool(
    "get_media_upload_signature",
    {
      description:
        "Returns a short-lived MediaLit upload signature and endpoint for the current team. Upload the file directly to `${endpoint}/media/create/resumable` (TUS resumable upload) with the signature in the `x-medialit-signature` header, then call register_media with the returned mediaId.",
      inputSchema: {},
      outputSchema: z.union([
        mediaUploadSignatureSchema,
        z.object({ error: z.string(), code: z.string() }),
      ]),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async (_args: any, extra: any) => {
      const teamId = getTeamId(extra);
      if (!teamId) return AUTH_ERROR;
      try {
        const result = await getMediaUploadSignature(teamId);
        return jsonResult(result);
      } catch (error) {
        if (error instanceof MediaError)
          return {
            ...jsonResult({ error: error.message, code: error.code }),
            isError: true,
          };
        return INTERNAL_ERROR;
      }
    },
  );

  server.registerTool(
    "register_media",
    {
      description:
        "Seals a freshly-uploaded MediaLit file (temp \u2192 permanent) and adds it to the team's media library.",
      inputSchema: createMediaBodySchema.shape,
      outputSchema: z.union([
        mediaSchema,
        z.object({ error: z.string(), code: z.string() }),
      ]),
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
        const item = await registerMedia({ teamId, ...args });
        if (!item) return INTERNAL_ERROR;
        return jsonResult(toPublicMedia(item));
      } catch (error) {
        if (error instanceof MediaError)
          return {
            ...jsonResult({ error: error.message, code: error.code }),
            isError: true,
          };
        return INTERNAL_ERROR;
      }
    },
  );

  server.registerTool(
    "list_media",
    {
      description: "Lists the current team's uploaded media library.",
      inputSchema: {},
      outputSchema: z.object({
        items: z.array(mediaSchema),
        total: z.number(),
      }),
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
        const [items, total] = await Promise.all([
          listMedia({ teamId }),
          countMedia({ teamId }),
        ]);
        return jsonResult({ items: items.map(toPublicMedia), total });
      } catch (error) {
        if (error instanceof MediaError)
          return {
            ...jsonResult({ error: error.message, code: error.code }),
            isError: true,
          };
        return INTERNAL_ERROR;
      }
    },
  );

  server.registerTool(
    "get_media",
    {
      description: "Fetches a single media item by id.",
      inputSchema: { mediaId: z.string() },
      outputSchema: mediaSchema,
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args: any, extra: any) => {
      const teamId = getTeamId(extra);
      if (!teamId) return AUTH_ERROR;
      try {
        const item = await getMediaByMediaId(teamId, args.mediaId);
        if (!item) return NOT_FOUND;
        return jsonResult(toPublicMedia(item));
      } catch (error) {
        if (error instanceof MediaError)
          return {
            ...jsonResult({ error: error.message, code: error.code }),
            isError: true,
          };
        return INTERNAL_ERROR;
      }
    },
  );

  server.registerTool(
    "update_media",
    {
      description: "Updates a media item's alt text and/or caption.",
      inputSchema: {
        mediaId: z.string(),
        alt: z.string().optional(),
        caption: z.string().optional(),
      },
      outputSchema: mediaSchema,
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
        const { mediaId, ...patch } = args;
        const item = await updateMedia(teamId, mediaId, patch);
        if (!item) return NOT_FOUND;
        return jsonResult(toPublicMedia(item));
      } catch (error) {
        if (error instanceof MediaError)
          return {
            ...jsonResult({ error: error.message, code: error.code }),
            isError: true,
          };
        return INTERNAL_ERROR;
      }
    },
  );

  server.registerTool(
    "delete_media",
    {
      description: "Deletes a media item from MediaLit and the team's library.",
      inputSchema: { mediaId: z.string() },
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
        const result = await deleteMediaRecord(teamId, args.mediaId);
        if (!result.ok) return NOT_FOUND;
        return jsonResult({ message: "Media deleted." });
      } catch (error) {
        if (error instanceof MediaError)
          return {
            ...jsonResult({ error: error.message, code: error.code }),
            isError: true,
          };
        return INTERNAL_ERROR;
      }
    },
  );
}
