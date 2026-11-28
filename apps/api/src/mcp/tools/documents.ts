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
  withPublishReport,
} from "../../documents/queries";
import {
  AUTH_ERROR,
  INTERNAL_ERROR,
  NOT_FOUND,
  errorResult,
  jsonResult,
} from "./responses";
import { InvalidSlugError, SlugConflictError } from "../../utils/slug";
import { getTeamId } from "./auth";
import { listPaging, listPagingInput } from "./paging";
import { DocsContentError, describeContentFormat } from "@frontlit/text-editor/docs";
import { documentationErrorBody } from "../../documentation/content-validation";
import { omitInternal, serializeDates } from "../../utils/public";
import { attachOneDocumentIndex } from "../../documentation/index-status";

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
  const row = withPublishReport({ ...doc });
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

/** The `markdown` field of every create/update tool: the format, generated
 * from the documentation profile so new blocks need no tool edits. */
const markdownField = z
  .string()
  .optional()
  .describe(
    `Body as Markdown, converted to TipTap JSON. Send markdown or content, never both. Invalid Markdown returns diagnostics with line numbers.\n${describeContentFormat()}`,
  );

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
    publishable: z
      .boolean()
      .optional()
      .describe("False when publish_* would be refused; see diagnostics."),
    diagnostics: z
      .array(z.any())
      .optional()
      .describe("What blocks publishing, e.g. a Button without its link."),
  });
  const itemSchema = kind === "doc" ? documentationSchema : documentSchema;
  const outputSchema =
    kind === "doc"
      ? z.union([documentationSchema, documentationValidationErrorSchema])
      : documentSchema;
  const bodyFields = {
    content: textEditorContentSchema
      .optional()
      .describe("Body as TipTap JSON. Send content or markdown, never both."),
    markdown: markdownField,
  };
  const handleError = (error: unknown) => {
    if (error instanceof DocsContentError)
      return { ...jsonResult(documentationErrorBody(error)), isError: true };
    if (error instanceof InvalidSlugError || error instanceof SlugConflictError)
      return errorResult(error.message);
    return INTERNAL_ERROR;
  };

  server.registerTool(
    `create_${label}`,
    {
      description:
        kind === "doc"
          ? `Creates a new ${humanLabel} (draft only) for the current team.`
          : `Creates a new ${humanLabel} (draft only) for the current team. Pass the body as Markdown (\`markdown\`) or TipTap JSON (\`content\`), or omit both for an empty draft. Invalid Markdown returns structured diagnostics with line numbers.`,
      inputSchema:
        kind === "doc"
          ? { ...createDocumentationBodySchema.shape, markdown: markdownField }
          : {
              title: z.string().min(1),
              ...bodyFields,
              featuredImage: z.union([z.string(), z.record(z.any())]).optional(),
              meta: metaSchema.optional(),
            },
      outputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
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

  const summarySchema = z.object({
    documentId: z.string(),
    title: z.string().describe("Draft title."),
    slug: z.string(),
    status: documentStatusSchema,
    publishedAt: z.string().nullable(),
    updatedAt: z.string().nullable(),
  });

  server.registerTool(
    `list_${label}s`,
    {
      description: `Lists the team's ${humanLabel}s, most recently edited first, as summaries: status (draft, published or published_with_changes) and publishedAt, without bodies. Use get_${label} for one ${humanLabel}'s content. Results are paged; total is the number of matching ${humanLabel}s.`,
      inputSchema: { q: z.string().optional(), ...listPagingInput },
      outputSchema: z.object({
        items: z.array(summarySchema),
        total: z.number(),
      }),
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    async (args: any, extra: any) => {
      const teamId = getTeamId(extra);
      if (!teamId) return AUTH_ERROR;
      try {
        const [items, total] = await Promise.all([
          listDocuments(kind, { teamId, q: args.q, ...listPaging(args) }),
          countDocuments(kind, { teamId, q: args.q }),
        ]);
        // No bodies: they make a list too large for MCP clients, which
        // truncate the result before the status fields.
        return jsonResult({
          items: items.map((doc) =>
            serializeDates({
              documentId: doc.documentId,
              title: doc.draftTitle,
              slug: doc.slug,
              status: deriveDocumentStatus(doc),
              publishedAt: doc.publishedAt,
              updatedAt: doc.updatedAt,
            }),
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
      },
    },
    async (args: any, extra: any) => {
      const teamId = getTeamId(extra);
      if (!teamId) return AUTH_ERROR;
      try {
        const doc = await getDocumentByDocumentId(kind, args.documentId, teamId);
        if (!doc || doc.teamId !== teamId) return NOT_FOUND;
        return jsonResult(toPublicDocument(await attachOneDocumentIndex(kind, doc)));
      } catch (error) {
        return handleError(error);
      }
    },
  );

  server.registerTool(
    `update_${label}`,
    {
      description:
        kind === "doc"
          ? `Updates a ${humanLabel}'s draft title, slug, body (Markdown via \`markdown\`, or TipTap JSON via \`content\`, never both), excerpt, featured image, and/or type-specific metadata. Writes only the draft state — call publish_${label} to make changes live.`
          : `Updates a ${humanLabel}'s draft title, body (Markdown via \`markdown\`, or TipTap JSON via \`content\`, never both), excerpt, featured image, type-specific metadata, and/or slug. Content fields write only the draft state — call publish_${label} to make them live. \`slug\` is the exception: it changes the public URL immediately, and changing \`title\` never changes the slug.`,
      inputSchema:
        kind === "doc"
          ? {
              documentId: z.string(),
              ...updateDocumentationBodySchema.shape,
              markdown: markdownField,
            }
          : {
              documentId: z.string(),
              slug: z
                .string()
                .min(1)
                .max(200)
                .optional()
                .describe(
                  "New URL slug. Normalized to lowercase-hyphenated form; must be unique within this content type. Takes effect on the public URL immediately.",
                ),
              title: z.string().optional(),
              ...bodyFields,
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
      },
    },
    async (args: any, extra: any) => {
      const teamId = getTeamId(extra);
      if (!teamId) return AUTH_ERROR;
      try {
        if (kind === "doc") {
          const current = await getDocumentByDocumentId(kind, args.documentId, teamId);
          const actor = extra.http?.authInfo?.extra;
          if (!current) return NOT_FOUND;
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
      },
    },
    async (args: any, extra: any) => {
      const teamId = getTeamId(extra);
      if (!teamId) return AUTH_ERROR;
      try {
        if (kind === "doc") {
          const current = await getDocumentByDocumentId(kind, args.documentId, teamId);
          const actor = extra.http?.authInfo?.extra;
          if (!current) return NOT_FOUND;
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
      },
    },
    async (args: any, extra: any) => {
      const teamId = getTeamId(extra);
      if (!teamId) return AUTH_ERROR;
      try {
        if (kind === "doc") {
          const current = await getDocumentByDocumentId(kind, args.documentId, teamId);
          const actor = extra.http?.authInfo?.extra;
          if (!current) return NOT_FOUND;
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
      },
    },
    async (args: any, extra: any) => {
      const teamId = getTeamId(extra);
      if (!teamId) return AUTH_ERROR;
      try {
        if (kind === "doc") {
          const current = await getDocumentByDocumentId(kind, args.documentId, teamId);
          const actor = extra.http?.authInfo?.extra;
          if (!current) return NOT_FOUND;
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
