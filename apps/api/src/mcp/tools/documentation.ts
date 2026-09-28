import type { McpToolRegistrar } from "../tool-registry";
import { z } from "zod";
import {
  documentationSearchResultSchema,
  documentationSectionSchema,
  successMessageSchema,
} from "@frontlit/api-contract";
import {
  countDocSections,
  createDocSection,
  deleteDocSection,
  listDocSections,
  searchChunks,
  updateDocSection,
} from "../../documentation/queries";
import { AUTH_ERROR, INTERNAL_ERROR, NOT_FOUND, jsonResult } from "./responses";
import { getTeamId } from "./auth";
import { omitInternal, serializeDates } from "../../utils/public";

function toPublicSection<T extends Record<string, unknown>>(section: T) {
  return serializeDates(omitInternal(section, "teamId"));
}

export function registerDocumentationTools(server: McpToolRegistrar): void {
  server.registerTool(
    "search_documentation",
    {
      description:
        "Semantic search over the team's published documentation. Embeds the query and ranks pgvector chunks by cosine similarity, returning the source page, heading and #anchor for each match.",
      inputSchema: {
        q: z.string().min(1),
        k: z.number().int().min(1).max(20).optional(),
      },
      outputSchema: z.object({
        items: z.array(documentationSearchResultSchema),
      }),
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
        const results = await searchChunks(teamId, args.q, args.k);
        return jsonResult({ items: results });
      } catch {
        return INTERNAL_ERROR;
      }
    },
  );

  server.registerTool(
    "create_documentation_section",
    {
      description: "Creates a help-center nav section for the current team.",
      inputSchema: {
        name: z.string().min(1),
        order: z.number().optional(),
      },
      outputSchema: documentationSectionSchema,
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
        const section = await createDocSection({ teamId, ...args });
        return jsonResult(toPublicSection(section));
      } catch {
        return INTERNAL_ERROR;
      }
    },
  );

  server.registerTool(
    "list_documentation_sections",
    {
      description: "Lists the current team's help-center nav sections, ordered.",
      inputSchema: {},
      outputSchema: z.object({
        items: z.array(documentationSectionSchema),
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
          listDocSections(teamId),
          countDocSections(teamId),
        ]);
        return jsonResult({ items: items.map(toPublicSection), total });
      } catch {
        return INTERNAL_ERROR;
      }
    },
  );

  server.registerTool(
    "update_documentation_section",
    {
      description: "Updates a help-center section's name and/or order.",
      inputSchema: {
        sectionId: z.string(),
        name: z.string().optional(),
        order: z.number().optional(),
      },
      outputSchema: documentationSectionSchema,
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
        const { sectionId, ...patch } = args;
        const section = await updateDocSection(teamId, sectionId, patch);
        if (!section) return NOT_FOUND;
        return jsonResult(toPublicSection(section));
      } catch {
        return INTERNAL_ERROR;
      }
    },
  );

  server.registerTool(
    "delete_documentation_section",
    {
      description: "Deletes a help-center section.",
      inputSchema: { sectionId: z.string() },
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
        const result = await deleteDocSection(teamId, args.sectionId);
        if (!result.ok) return NOT_FOUND;
        return jsonResult({ message: "Section deleted." });
      } catch {
        return INTERNAL_ERROR;
      }
    },
  );
}
