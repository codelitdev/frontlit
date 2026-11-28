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
  editableTextResult,
  errorResult,
  jsonResult,
} from "./responses";
import { InvalidSlugError, SlugConflictError } from "../../utils/slug";
import { StaleDraftError, staleDraftBody } from "../../utils/draft-version";
import { getTeamId } from "./auth";
import { listPaging, listPagingInput } from "./paging";
import {
  DocsContentError,
  describeContentFormat,
  docsProfile,
} from "@frontlit/text-editor/docs";
import {
  ContentError,
  TextEditError,
  editContent,
  toEditableMarkdown,
  type Profile,
} from "@frontlit/text-editor/blocks";
import { defaultProfile } from "@frontlit/text-editor/profiles";
import { documentationErrorBody } from "../../documentation/content-validation";
import { omitInternal, serializeDates } from "../../utils/public";
import { attachOneDocumentIndex } from "../../documentation/index-status";

/** Documentation-only columns on the shared documents table; other content
 * kinds do not declare them in their output schema. */
const DOCUMENTATION_ONLY_KEYS = [
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

/** The `edits` input of every edit_* tool. */
export const textEditsField = z
  .array(
    z.object({
      old_str: z
        .string()
        .min(1)
        .describe(
          "Exact text to replace, copied from the text get_* returned. Must occur exactly once.",
        ),
      new_str: z.string().describe("Replacement text. Empty deletes old_str."),
    }),
  )
  .min(1)
  .max(50)
  .describe(
    "Exact-match replacements, applied in order (each to the result of the previous one), all or nothing. Include enough surrounding text for old_str to match exactly once; to insert, repeat nearby text in old_str and new_str.",
  );

/** An edit that doesn't apply, as a tool error the agent can act on. */
export function textEditErrorResult(error: TextEditError) {
  return {
    ...jsonResult({
      error: error.message,
      code: error.code,
      index: error.index,
      ...(error.matches !== undefined ? { matches: error.matches } : {}),
    }),
    isError: true,
  };
}

/**
 * `editContent`, with content failures reported as `DocsContentError` like
 * every other body write. (`@frontlit/text-editor/blocks` and `/docs` are
 * separate bundles with their own `ContentError`, so `asDocsError` from
 * `/docs` doesn't recognize this one.)
 */
export function editBody(profile: Profile, content: unknown, edits: TextEditInput) {
  try {
    return editContent(profile, content, edits);
  } catch (error) {
    if (error instanceof ContentError) throw new DocsContentError(error.diagnostics);
    throw error;
  }
}
type TextEditInput = Parameters<typeof editContent>[2];

/** Articles and product updates are edited in the default editor; docs in the docs profile. */
function bodyProfile(kind: DocumentKind): Profile {
  return kind === "doc" ? docsProfile : defaultProfile;
}

const EDITABLE_MARKDOWN_NOTE =
  "draftMarkdown is the draft body as editable Markdown, also returned verbatim as its own text block: copy old_str values for edit_* from it. A block Markdown can't express (a resized image, a merged-cell table) appears as a fenced ```tiptap block holding its JSON; edit text inside it the same way.";

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
    draftVersion: z.number().int(),
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
  const baseItemSchema: z.AnyZodObject =
    kind === "doc" ? documentationSchema : documentSchema;
  const itemSchema = baseItemSchema
    .omit({ content: true, draftContent: true, draftMarkdown: true })
    .extend({
      draftMarkdown: z
        .string()
        .describe(
          "The draft body as editable Markdown; edit_* changes exactly this text.",
        ),
    });
  const editResultSchema = z.object({
    documentId: z.string(),
    status: documentStatusSchema,
    draftVersion: z.number().int(),
    updatedAt: z.string().nullable(),
    publishable: z.boolean().optional(),
    diagnostics: z.array(z.any()).optional(),
  });
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
    if (error instanceof StaleDraftError)
      return { ...jsonResult(staleDraftBody(error)), isError: true };
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
              expectedDraftVersion: z
                .number()
                .int()
                .positive()
                .optional()
                .describe(
                  "The draftVersion you read. If the draft changed since, nothing is saved and STALE_DRAFT is returned. Omit to overwrite unconditionally.",
                ),
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
      description: `Fetches a single ${humanLabel} by id: its draft metadata, draftVersion and status (published_with_changes when the draft differs from the live version). ${EDITABLE_MARKDOWN_NOTE} To change part of the body, use edit_${label}; update_${label} replaces it whole.`,
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
        const {
          content: _published,
          draftContent: _draft,
          draftMarkdown: _docsMarkdown,
          ...rest
        } = toPublicDocument(await attachOneDocumentIndex(kind, doc)) as Record<
          string,
          unknown
        >;
        return editableTextResult(
          rest,
          "draftMarkdown",
          toEditableMarkdown(bodyProfile(kind), doc.draftContent),
        );
      } catch (error) {
        return handleError(error);
      }
    },
  );

  server.registerTool(
    `edit_${label}`,
    {
      description: `Changes part of a ${humanLabel}'s draft body with exact-match replacements on the draftMarkdown get_${label} returns, without resending the body. Each old_str must match exactly once; all edits apply or none do. A failed match returns EDIT_NOT_FOUND or EDIT_AMBIGUOUS with the edit's index (re-read with get_${label}); content that doesn't validate returns diagnostics with line numbers in the edited text. If someone saved the draft at the same moment, ${kind === "doc" ? "STALE_DOCS_DRAFT" : "STALE_DRAFT"} is returned: call again. Writes only the draft; call publish_${label} to make it live. Replies without the body.`,
      inputSchema: { documentId: z.string(), edits: textEditsField },
      outputSchema: editResultSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
      },
    },
    async (args: any, extra: any) => {
      const teamId = getTeamId(extra);
      if (!teamId) return AUTH_ERROR;
      try {
        const current = await getDocumentByDocumentId(kind, args.documentId, teamId);
        if (!current || current.teamId !== teamId) return NOT_FOUND;
        const content = editBody(bodyProfile(kind), current.draftContent, args.edits);
        const doc = await updateDocument(kind, teamId, args.documentId, {
          content: content as never,
          expectedDraftVersion: current.draftVersion,
        });
        if (!doc) return NOT_FOUND;
        const view = toPublicDocument(doc) as Record<string, unknown>;
        return jsonResult({
          documentId: view.documentId,
          status: view.status,
          draftVersion: view.draftVersion,
          updatedAt: view.updatedAt,
          ...(view.publishable !== undefined ? { publishable: view.publishable } : {}),
          ...(view.diagnostics !== undefined ? { diagnostics: view.diagnostics } : {}),
        });
      } catch (error) {
        if (error instanceof TextEditError) return textEditErrorResult(error);
        return handleError(error);
      }
    },
  );

  server.registerTool(
    `update_${label}`,
    {
      description:
        kind === "doc"
          ? `Updates a ${humanLabel}'s draft title, slug, body (Markdown via \`markdown\`, or TipTap JSON via \`content\`, never both), excerpt, featured image, and/or type-specific metadata. Writes only the draft state — call publish_${label} to make changes live. A body sent here replaces the whole draft body: to change part of it, use edit_${label} instead.`
          : `Updates a ${humanLabel}'s draft title, body (Markdown via \`markdown\`, or TipTap JSON via \`content\`, never both), excerpt, featured image, type-specific metadata, and/or slug. Content fields write only the draft state — call publish_${label} to make them live. \`slug\` is the exception: it changes the public URL immediately, and changing \`title\` never changes the slug. A body sent here replaces the whole draft body: to change part of it, use edit_${label} instead.`,
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
              expectedDraftVersion: z
                .number()
                .int()
                .positive()
                .optional()
                .describe(
                  "The draftVersion you read. If the draft changed since, nothing is saved and STALE_DRAFT is returned. Omit to overwrite unconditionally.",
                ),
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
