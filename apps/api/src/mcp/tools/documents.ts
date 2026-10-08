import { documentationReadAllowed } from "../../documentation/publications";
import type { McpToolRegistrar } from "../tool-registry";
import { z } from "zod";
import {
  documentationSchema,
  documentationPublishBodySchema,
  documentationVersionBodySchema,
  documentationIndexSchema,
  documentStatusSchema,
  successMessageSchema,
  textEditorContentSchema,
  createDocumentationBodySchema,
  updateDocumentationBodySchema,
  documentationValidationErrorSchema,
} from "@frontlit/api-contract";
import type { DocumentKind } from "../../db/schema";
import {
  countDocuments,
  createDocument,
  deleteDocument,
  deriveDocumentStatus,
  discardDocumentDraft,
  getDocumentByDocumentId,
  listDocuments,
  publishDocument,
  updateDocument,
} from "../../documents/queries";
import { AUTH_ERROR, INTERNAL_ERROR, NOT_FOUND, jsonResult } from "./responses";
import { getTeamId } from "./auth";
import { DocsContentError } from "@frontlit/text-editor/docs";
import { documentationErrorBody } from "../../documentation/content-validation";
import { omitInternal, serializeDates } from "../../utils/public";
import {
  attachDocumentIndex,
  attachOneDocumentIndex,
} from "../../documentation/index-status";

/** Documentation-only columns on the shared documents table; other content
 * kinds do not declare them in their output schema. */
const DOCUMENTATION_ONLY_KEYS = [
  "draftVersion",
  "draftSlug",
  "draftMarkdown",
  "draftHash",
  "draftGitSource",
] as const;

function toPublicDocument<T extends Record<string, unknown>>(doc: T) {
  const row = { ...doc };
  if (row.kind !== "doc")
    for (const key of DOCUMENTATION_ONLY_KEYS)
      delete (row as Record<string, unknown>)[key];
  return serializeDates(
    omitInternal(
      { ...row, status: deriveDocumentStatus(doc as any) },
      "teamId",
      "kind",
      "authorAccountId",
    ),
  );
}

/**
 * One implementation behind every typed Content tool set (`create_article`,
 * `create_documentation_page`, and `create_product_update`). `label` names
 * the tools/output schema; `metaSchema` documents type-specific metadata for
 * MCP clients. The database kind stays internal.
 */
export function registerDocumentTools(
  server: McpToolRegistrar,
  kind: DocumentKind,
  label: "article" | "documentation_page" | "product_update",
  metaSchema: z.ZodTypeAny,
): void {
  const humanLabel = label.replaceAll("_", " ");
  const documentSchema = z.object({
    documentId: z.string(),
    slug: z.string(),
    status: documentStatusSchema,
    publishedAt: z.string().nullable().optional(),
    title: z.string().nullable().optional(),
    content: textEditorContentSchema.nullable().optional(),
    excerpt: z.string().nullable().optional(),
    featuredImage: z.record(z.any()).nullable().optional(),
    meta: metaSchema,
    draftTitle: z.string(),
    draftContent: textEditorContentSchema,
    draftExcerpt: z.string().nullable().optional(),
    draftFeaturedImage: z.record(z.any()).nullable().optional(),
    draftMeta: metaSchema,
    createdAt: z.string().nullable(),
    updatedAt: z.string().nullable(),
    index: documentationIndexSchema.nullable().optional(),
  });
  const itemSchema = kind === "doc" ? documentationSchema : documentSchema;
  const outputSchema =
    kind === "doc"
      ? z.union([documentationSchema, documentationValidationErrorSchema])
      : documentSchema;
  const handleError = (error: unknown) =>
    error instanceof DocsContentError
      ? { ...jsonResult(documentationErrorBody(error)), isError: true }
      : INTERNAL_ERROR;

  server.registerTool(
    `create_${label}`,
    {
      description: `Creates a new, empty ${humanLabel} (draft only) for the current team.`,
      inputSchema:
        kind === "doc"
          ? createDocumentationBodySchema.shape
          : {
              title: z.string().min(1),
              featuredImage: z.union([z.string(), z.record(z.any())]).optional(),
              meta: metaSchema.optional(),
            },
      outputSchema,
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
        const doc = await createDocument(kind, {
          teamId,
          ...args,
        });
        return jsonResult(toPublicDocument(await attachOneDocumentIndex(kind, doc)));
      } catch (error) {
        return handleError(error);
      }
    },
  );

  server.registerTool(
    `list_${label}s`,
    {
      description: `Lists ${humanLabel}s for the current team, optionally filtered by a title search term.`,
      inputSchema: { q: z.string().optional() },
      outputSchema: z.object({
        items: z.array(itemSchema),
        total: z.number(),
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
        let items = await listDocuments(kind, { teamId, q: args.q });
        let total = await countDocuments(kind, { teamId, q: args.q });
        const actor = extra.http?.authInfo?.extra;
        if (
          kind === "doc" &&
          !(actor?.isOwner || actor?.permissions?.includes("documentation:manage"))
        ) {
          const visible = await Promise.all(
            items.map(async (row) =>
              (await documentationReadAllowed(teamId, row, false)) ? row : null,
            ),
          );
          items = visible.filter(Boolean) as any;
          total = items.length;
        }
        return jsonResult({
          items: (await attachDocumentIndex(kind, items)).map((item) =>
            toPublicDocument(item),
          ),
          total,
        });
      } catch (error) {
        return handleError(error);
      }
    },
  );

  server.registerTool(
    `get_${label}`,
    {
      description: `Fetches a single ${humanLabel} by id, including its full draft and published content.`,
      inputSchema: { documentId: z.string() },
      outputSchema: itemSchema,
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
        const doc = await getDocumentByDocumentId(kind, args.documentId, teamId);
        if (
          !doc ||
          doc.teamId !== teamId ||
          (kind === "doc" &&
            !(await documentationReadAllowed(
              teamId,
              doc,
              extra.http?.authInfo?.extra?.isOwner ||
                extra.http?.authInfo?.extra?.permissions?.includes(
                  "documentation:manage",
                ),
            )))
        )
          return NOT_FOUND;
        return jsonResult(toPublicDocument(await attachOneDocumentIndex(kind, doc)));
      } catch (error) {
        return handleError(error);
      }
    },
  );

  server.registerTool(
    `update_${label}`,
    {
      description: `Updates a ${humanLabel}'s draft title, content (TipTap JSON), excerpt, featured image, and/or type-specific metadata. Writes only the draft state — call publish_${label} to make changes live.`,
      inputSchema:
        kind === "doc"
          ? { documentId: z.string(), ...updateDocumentationBodySchema.shape }
          : {
              documentId: z.string(),
              title: z.string().optional(),
              content: textEditorContentSchema.optional(),
              excerpt: z.string().optional(),
              featuredImage: z
                .union([z.string(), z.record(z.any())])
                .nullable()
                .optional(),
              meta: metaSchema.optional(),
            },
      outputSchema,
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
        if (kind === "doc") {
          const current = await getDocumentByDocumentId(kind, args.documentId, teamId);
          const actor = extra.http?.authInfo?.extra;
          if (
            !current ||
            !(await documentationReadAllowed(
              teamId,
              current,
              actor?.isOwner || actor?.permissions?.includes("documentation:manage"),
            ))
          )
            return NOT_FOUND;
        }
        const { documentId, ...patch } = args;
        const doc = await updateDocument(kind, teamId, documentId, patch);
        if (!doc) return NOT_FOUND;
        return jsonResult(toPublicDocument(await attachOneDocumentIndex(kind, doc)));
      } catch (error) {
        return handleError(error);
      }
    },
  );

  server.registerTool(
    `publish_${label}`,
    {
      description: `Publishes a ${humanLabel}: copies its draft content into the published fields the public site/API renders.`,
      inputSchema: {
        documentId: z.string(),
        ...(kind === "doc" ? documentationPublishBodySchema.shape : {}),
      },
      outputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args: any, extra: any) => {
      const teamId = getTeamId(extra);
      if (!teamId) return AUTH_ERROR;
      try {
        if (kind === "doc") {
          const current = await getDocumentByDocumentId(kind, args.documentId, teamId);
          const actor = extra.http?.authInfo?.extra;
          if (
            !current ||
            !(await documentationReadAllowed(
              teamId,
              current,
              actor?.isOwner || actor?.permissions?.includes("documentation:manage"),
            ))
          )
            return NOT_FOUND;
        }
        const doc = await publishDocument(
          kind,
          teamId,
          args.documentId,
          args.expectedDraftVersion,
          kind === "doc"
            ? {
                expectedDocsDraftVersion: args.expectedDocsDraftVersion,
                expectedPublicationId: args.expectedPublicationId,
              }
            : undefined,
        );
        if (!doc) return NOT_FOUND;
        return jsonResult(toPublicDocument(await attachOneDocumentIndex(kind, doc)));
      } catch (error) {
        return handleError(error);
      }
    },
  );

  server.registerTool(
    `discard_${label}_draft`,
    {
      description: `Discards a ${humanLabel}'s draft changes, resetting the draft content back to whatever is currently published.`,
      inputSchema: {
        documentId: z.string(),
        ...(kind === "doc" ? documentationVersionBodySchema.shape : {}),
      },
      outputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args: any, extra: any) => {
      const teamId = getTeamId(extra);
      if (!teamId) return AUTH_ERROR;
      try {
        if (kind === "doc") {
          const current = await getDocumentByDocumentId(kind, args.documentId, teamId);
          const actor = extra.http?.authInfo?.extra;
          if (
            !current ||
            !(await documentationReadAllowed(
              teamId,
              current,
              actor?.isOwner || actor?.permissions?.includes("documentation:manage"),
            ))
          )
            return NOT_FOUND;
        }
        const doc = await discardDocumentDraft(
          kind,
          teamId,
          args.documentId,
          args.expectedDraftVersion,
        );
        if (!doc) return NOT_FOUND;
        return jsonResult(toPublicDocument(await attachOneDocumentIndex(kind, doc)));
      } catch (error) {
        return handleError(error);
      }
    },
  );

  server.registerTool(
    `delete_${label}`,
    {
      description: `Permanently deletes a ${humanLabel}.`,
      inputSchema: {
        documentId: z.string(),
        ...(kind === "doc" ? documentationVersionBodySchema.shape : {}),
      },
      outputSchema:
        kind === "doc"
          ? z.union([successMessageSchema, documentationValidationErrorSchema])
          : successMessageSchema,
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
        if (kind === "doc") {
          const current = await getDocumentByDocumentId(kind, args.documentId, teamId);
          const actor = extra.http?.authInfo?.extra;
          if (
            !current ||
            !(await documentationReadAllowed(
              teamId,
              current,
              actor?.isOwner || actor?.permissions?.includes("documentation:manage"),
            ))
          )
            return NOT_FOUND;
        }
        const result = await deleteDocument(
          kind,
          teamId,
          args.documentId,
          args.expectedDraftVersion,
        );
        if (!result.ok) return NOT_FOUND;
        return jsonResult({ message: `${humanLabel} deleted.` });
      } catch (error) {
        return handleError(error);
      }
    },
  );
}
