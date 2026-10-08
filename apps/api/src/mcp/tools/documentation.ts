import {
  listDocumentationImprovements,
  getDocumentationImprovement,
  reviewDocumentationImprovement,
  createDocumentationImprovementDraft,
} from "../../documentation/improvements";
import {
  documentationImprovementQuerySchema,
  documentationImprovementSchema,
  documentationImprovementsSchema,
  reviewDocumentationImprovementSchema,
  createDocumentationImprovementDraftSchema,
  documentationImprovementDraftSchema,
} from "@frontlit/api-contract";
import {
  publicationForReader,
  getDocsUiSettings,
  previewDocumentation,
  listPublicationHistory,
  getRetainedRevision,
  listDocumentRevisions,
  unpublishDocumentation,
  retryDocumentationPublication,
} from "../../documentation/experience";
import {
  documentationHistoryQuerySchema,
  documentationHistorySchema,
  documentationPreviewSchema,
  documentationRevisionSchema,
  documentationRevisionReceiptSchema,
  unpublishDocumentationBodySchema,
  retryDocumentationPublicationBodySchema,
  documentationVersionBodySchema,
} from "@frontlit/api-contract";
import {
  queuePublication,
  getPublication,
  preflightPurge,
  getPurge,
} from "../../documentation/publications";
import { publicPublication, publicPurge } from "../../documentation/projections";
import {
  queueDocumentationPublicationSchema,
  documentationPublicationSchema,
  preflightDocumentationPurgeSchema,
  documentationPurgeSchema,
  commitDocumentationPurgeSchema,
} from "@frontlit/api-contract";
import {
  updateDocsSettings,
  validateDocumentation,
} from "../../documentation/authoring";
import { DocsContentError } from "@frontlit/text-editor/docs";
import { documentationErrorBody } from "../../documentation/content-validation";
import type { McpToolRegistrar } from "../tool-registry";
import { z } from "zod";
import { documentationPrincipal } from "../../documentation/admission";
import {
  createDocumentationSectionBodySchema,
  updateDocumentationSectionBodySchema,
  documentationValidationBodySchema,
  documentationValidationReportSchema,
  documentationValidationErrorSchema,
  documentationSettingsSchema,
  updateDocumentationSettingsBodySchema,
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

function canManage(auth: any) {
  return Boolean(auth?.isOwner || auth?.permissions?.includes("documentation:manage"));
}

function toPublicSection<T extends Record<string, unknown>>(section: T) {
  return serializeDates(omitInternal(section, "teamId"));
}

export function registerDocumentationTools(server: McpToolRegistrar): void {
  const commands = [
    {
      name: "list_documentation_publications",
      description: "Read team-scoped publication history without bodies.",
      input: documentationHistoryQuerySchema.shape,
      output: documentationHistorySchema,
      run: (teamId: string, args: any, auth: any) =>
        listPublicationHistory(teamId, args, canManage(auth)),
      project: (value: any) => value,
      read: true,
    },
    {
      name: "list_documentation_improvements",
      description:
        "List only authorized support evidence or approved redacted artifacts.",
      input: documentationImprovementQuerySchema.shape,
      output: documentationImprovementsSchema,
      run: (teamId: string, args: any, auth: any) =>
        listDocumentationImprovements(teamId, args, auth),
      project: (value: any) => value,
      read: true,
    },
    {
      name: "get_documentation_improvement",
      description: "Read authorized evidence and approved artifact links.",
      input: { itemId: z.string() },
      output: documentationImprovementSchema,
      run: (teamId: string, args: any, auth: any) =>
        getDocumentationImprovement(teamId, args.itemId, auth),
      project: (value: any) => value,
      read: true,
    },
    {
      name: "review_documentation_improvement",
      description:
        "Version-checked support review, merge or explicit redacted-summary approval.",
      input: { itemId: z.string(), input: reviewDocumentationImprovementSchema },
      output: documentationImprovementSchema,
      run: (teamId: string, args: any, auth: any) =>
        reviewDocumentationImprovement(teamId, args.itemId, args.input, auth),
      project: (value: any) => value,
    },
    {
      name: "create_documentation_improvement_draft",
      description:
        "Create exactly one safe private draft from an approved artifact; never publishes.",
      input: { itemId: z.string(), input: createDocumentationImprovementDraftSchema },
      output: documentationImprovementDraftSchema,
      run: (teamId: string, args: any, auth: any) =>
        createDocumentationImprovementDraft(teamId, args.itemId, args.input, auth),
      project: (value: any) => value,
    },
    {
      name: "preview_documentation_page",
      description:
        "Private unpublished data preview; no public URL or executable tenant shell.",
      input: { documentId: z.string(), ...documentationVersionBodySchema.shape },
      output: documentationPreviewSchema,
      run: (teamId: string, args: any, auth: any) =>
        previewDocumentation(
          teamId,
          args.documentId,
          args.expectedDraftVersion,
          canManage(auth),
        ),
      project: (value: any) => value,
      read: true,
    },
    {
      name: "list_documentation_revisions",
      description: "List retained accepted revisions.",
      input: { documentId: z.string() },
      output: z.object({ items: z.array(documentationRevisionReceiptSchema) }),
      run: (teamId: string, args: any, auth: any) =>
        listDocumentRevisions(teamId, args.documentId, canManage(auth)),
      project: (value: any) => value,
      read: true,
    },
    {
      name: "get_documentation_revision",
      description: "Read a retained accepted revision after policy checks.",
      input: { documentId: z.string(), revisionId: z.string() },
      output: documentationRevisionSchema,
      run: (teamId: string, args: any, auth: any) =>
        getRetainedRevision(teamId, args.documentId, args.revisionId, canManage(auth)),
      project: (value: any) => value,
      read: true,
    },
    {
      name: "unpublish_documentation_page",
      description: "Queue a validated removal while retaining the draft.",
      input: { documentId: z.string(), ...unpublishDocumentationBodySchema.shape },
      output: documentationPublicationSchema,
      run: (teamId: string, args: any) => {
        const { documentId, ...input } = args;
        return unpublishDocumentation(teamId, documentId, input);
      },
      project: publicPublication,
    },
    {
      name: "retry_documentation_publication",
      description:
        "Retry the exact retained failed candidate against its current base.",
      input: {
        publicationId: z.string(),
        ...retryDocumentationPublicationBodySchema.shape,
      },
      output: documentationPublicationSchema,
      run: (teamId: string, args: any) =>
        retryDocumentationPublication(teamId, args.publicationId, args.idempotencyKey),
      project: publicPublication,
    },
    {
      name: "publish_documentation_changes",
      description:
        "Queue captured draft versions, routes, Sections and indexing for atomic publication.",
      input: queueDocumentationPublicationSchema.shape,
      output: documentationPublicationSchema,
      run: (teamId: string, args: any) => queuePublication(teamId, args),
      project: publicPublication,
    },
    {
      name: "get_documentation_publication",
      description: "Read publication status and diagnostics.",
      input: { publicationId: z.string() },
      output: documentationPublicationSchema,
      run: async (teamId: string, args: any, auth: any) => {
        const row = await getPublication(teamId, args.publicationId);
        return row ? publicationForReader(teamId, row, canManage(auth)) : null;
      },
      project: (value: any) => value,
      read: true,
    },
    {
      name: "preflight_documentation_purge",
      description:
        "Prepare exact irreversible purge plan. An owner must complete it in a recently verified browser session.",
      input: preflightDocumentationPurgeSchema.shape,
      output: documentationPurgeSchema,
      run: (teamId: string, args: any, actor: any) =>
        preflightPurge(teamId, args.documentIds, actor?.account?.id),
      project: publicPurge,
    },
    {
      name: "get_documentation_purge",
      description: "Read purge plan/status without content bodies.",
      input: { purgeId: z.string() },
      output: documentationPurgeSchema,
      run: (teamId: string, args: any) => getPurge(teamId, args.purgeId),
      project: publicPurge,
      read: true,
    },
  ] as const;
  for (const command of commands)
    server.registerTool(
      command.name,
      {
        description: command.description,
        inputSchema: command.input,
        outputSchema: z.union([command.output, documentationValidationErrorSchema]),
        annotations: {
          readOnlyHint: "read" in command ? command.read : false,
          openWorldHint: false,
        },
      },
      async (args: any, extra: any) => {
        const teamId = getTeamId(extra);
        if (!teamId) return AUTH_ERROR;
        try {
          const value = await command.run(teamId, args, {
            ...extra.http?.authInfo?.extra,
            accountId: extra.http?.authInfo?.extra?.account?.id,
            scopes: extra.http?.authInfo?.scopes,
            authKind: extra.http?.authInfo?.extra?.authKind ?? "oauth",
          });
          return value ? jsonResult(command.project(value as any)) : NOT_FOUND;
        } catch (error) {
          return error instanceof DocsContentError
            ? { ...jsonResult(documentationErrorBody(error)), isError: true }
            : INTERNAL_ERROR;
        }
      },
    );
  server.registerTool(
    "purge_documentation",
    {
      description:
        "Purge completion requires interactive owner reverification. This tool provides the browser action and never performs irreversible deletion.",
      inputSchema: commitDocumentationPurgeSchema.shape,
      outputSchema: z.object({
        code: z.literal("INTERACTIVE_OWNER_REQUIRED"),
        action: z.string(),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => ({
      ...jsonResult({
        code: "INTERACTIVE_OWNER_REQUIRED",
        action:
          "Reverify the owner browser session, then POST the reviewed plan to /content/documentation/purges.",
      }),
      isError: true,
    }),
  );

  server.registerTool(
    "validate_documentation",
    {
      description:
        "Validate an unsaved document or a candidate publication without changing drafts, publication, or retrieval.",
      inputSchema: { input: documentationValidationBodySchema },
      outputSchema: z.union([
        documentationValidationReportSchema,
        documentationValidationErrorSchema,
      ]),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args: any, extra: any) => {
      const teamId = getTeamId(extra);
      if (!teamId) return AUTH_ERROR;
      try {
        const auth = extra.http?.authInfo;
        const principal = documentationPrincipal({
          accountId: auth?.extra?.account?.id,
          apiKeyId: auth?.extra?.authKind === "api_key" ? auth.token : undefined,
        });
        const report = await validateDocumentation(teamId, args.input, principal);
        return report ? jsonResult(report) : NOT_FOUND;
      } catch (error) {
        return error instanceof DocsContentError
          ? { ...jsonResult(documentationErrorBody(error)), isError: true }
          : INTERNAL_ERROR;
      }
    },
  );
  server.registerTool(
    "get_documentation_settings",
    {
      description: "Read documentation ownership and draft settings.",
      inputSchema: {},
      outputSchema: documentationSettingsSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (_args: any, extra: any) => {
      const teamId = getTeamId(extra);
      if (!teamId) return AUTH_ERROR;
      return jsonResult(omitInternal(await getDocsUiSettings(teamId), "teamId"));
    },
  );
  server.registerTool(
    "update_documentation_settings",
    {
      description:
        "Update indexing settings using the acknowledged documentation settings version. Source ownership cannot be changed here.",
      inputSchema: updateDocumentationSettingsBodySchema.shape,
      outputSchema: z.union([
        documentationSettingsSchema,
        documentationValidationErrorSchema,
      ]),
      annotations: { readOnlyHint: false, openWorldHint: false },
    },
    async (args: any, extra: any) => {
      const teamId = getTeamId(extra);
      if (!teamId) return AUTH_ERROR;
      try {
        return jsonResult(
          omitInternal(await updateDocsSettings(teamId, args), "teamId"),
        );
      } catch (error) {
        return error instanceof DocsContentError
          ? { ...jsonResult(documentationErrorBody(error)), isError: true }
          : INTERNAL_ERROR;
      }
    },
  );

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
      } catch (error) {
        return error instanceof DocsContentError
          ? { ...jsonResult(documentationErrorBody(error)), isError: true }
          : INTERNAL_ERROR;
      }
    },
  );

  server.registerTool(
    "create_documentation_section",
    {
      description: "Creates a help-center nav section for the current team.",
      inputSchema: createDocumentationSectionBodySchema.shape,
      outputSchema: z.union([
        documentationSectionSchema,
        documentationValidationErrorSchema,
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
        const section = await createDocSection({ teamId, ...args });
        return jsonResult(toPublicSection(section));
      } catch (error) {
        return error instanceof DocsContentError
          ? { ...jsonResult(documentationErrorBody(error)), isError: true }
          : INTERNAL_ERROR;
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
      } catch (error) {
        return error instanceof DocsContentError
          ? { ...jsonResult(documentationErrorBody(error)), isError: true }
          : INTERNAL_ERROR;
      }
    },
  );

  server.registerTool(
    "update_documentation_section",
    {
      description: "Updates a help-center section's name and/or order.",
      inputSchema: {
        sectionId: z.string(),
        ...updateDocumentationSectionBodySchema.shape,
      },
      outputSchema: z.union([
        documentationSectionSchema,
        documentationValidationErrorSchema,
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
        const { sectionId, ...patch } = args;
        const section = await updateDocSection(teamId, sectionId, patch);
        if (!section) return NOT_FOUND;
        return jsonResult(toPublicSection(section));
      } catch (error) {
        return error instanceof DocsContentError
          ? { ...jsonResult(documentationErrorBody(error)), isError: true }
          : INTERNAL_ERROR;
      }
    },
  );

  server.registerTool(
    "delete_documentation_section",
    {
      description: "Deletes a help-center section.",
      inputSchema: {
        sectionId: z.string(),
        expectedDocsDraftVersion: z.number().int().positive(),
      },
      outputSchema: z.union([successMessageSchema, documentationValidationErrorSchema]),
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
        const result = await deleteDocSection(
          teamId,
          args.sectionId,
          args.expectedDocsDraftVersion,
        );
        if (!result.ok) return NOT_FOUND;
        return jsonResult({ message: "Section deleted." });
      } catch (error) {
        return error instanceof DocsContentError
          ? { ...jsonResult(documentationErrorBody(error)), isError: true }
          : INTERNAL_ERROR;
      }
    },
  );
}
