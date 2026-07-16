import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { documentStatusSchema, successMessageSchema, textEditorContentSchema } from "@frontlit/api-contract";
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
import { omitInternal, serializeDates } from "../../utils/public";

function toPublicDocument<T extends Record<string, unknown>>(doc: T) {
    return serializeDates(omitInternal({ ...doc, status: deriveDocumentStatus(doc as any) }, "teamId", "kind"));
}

/**
 * One implementation behind every kind-scoped tool set (`create_blog_post`,
 * `create_help_doc`, `create_changelog_entry`, \u2026 \u2014 architecture.md \u00a72).
 * `label` names the tools/output schema (e.g. "blog_post"); `metaSchema`
 * documents the kind-specific `meta` shape for MCP clients.
 */
export function registerDocumentTools(server: McpServer, kind: DocumentKind, label: string, metaSchema: z.ZodTypeAny): void {
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
    });

    server.registerTool(
        `create_${label}`,
        {
            description: `Creates a new, empty ${label} (draft only) for the current team.`,
            inputSchema: { title: z.string().min(1), meta: metaSchema.optional() },
            outputSchema: documentSchema,
            annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
        },
        async (args: any, extra: any) => {
            const teamId = getTeamId(extra);
            if (!teamId) return AUTH_ERROR;
            try {
                const doc = await createDocument(kind, { teamId, title: args.title, meta: args.meta });
                return jsonResult(toPublicDocument(doc));
            } catch {
                return INTERNAL_ERROR;
            }
        },
    );

    server.registerTool(
        `list_${label}s`,
        {
            description: `Lists ${label}s for the current team, optionally filtered by a title search term.`,
            inputSchema: { q: z.string().optional() },
            outputSchema: z.object({ items: z.array(documentSchema), total: z.number() }),
            annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
        },
        async (args: any, extra: any) => {
            const teamId = getTeamId(extra);
            if (!teamId) return AUTH_ERROR;
            try {
                const [items, total] = await Promise.all([
                    listDocuments(kind, { teamId, q: args.q }),
                    countDocuments(kind, { teamId, q: args.q }),
                ]);
                return jsonResult({ items: items.map(toPublicDocument), total });
            } catch {
                return INTERNAL_ERROR;
            }
        },
    );

    server.registerTool(
        `get_${label}`,
        {
            description: `Fetches a single ${label} by id, including its full draft and published content.`,
            inputSchema: { documentId: z.string() },
            outputSchema: documentSchema,
            annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
        },
        async (args: any, extra: any) => {
            const teamId = getTeamId(extra);
            if (!teamId) return AUTH_ERROR;
            try {
                const doc = await getDocumentByDocumentId(kind, args.documentId);
                if (!doc || doc.teamId !== teamId) return NOT_FOUND;
                return jsonResult(toPublicDocument(doc));
            } catch {
                return INTERNAL_ERROR;
            }
        },
    );

    server.registerTool(
        `update_${label}`,
        {
            description: `Updates a ${label}'s draft title, content (TipTap JSON), excerpt, featured image, and/or kind-specific meta. Writes only the draft state \u2014 call publish_${label} to make changes live.`,
            inputSchema: {
                documentId: z.string(),
                title: z.string().optional(),
                content: textEditorContentSchema.optional(),
                excerpt: z.string().optional(),
                featuredImage: z.record(z.any()).optional(),
                meta: metaSchema.optional(),
            },
            outputSchema: documentSchema,
            annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
        },
        async (args: any, extra: any) => {
            const teamId = getTeamId(extra);
            if (!teamId) return AUTH_ERROR;
            try {
                const { documentId, ...patch } = args;
                const doc = await updateDocument(kind, teamId, documentId, patch);
                if (!doc) return NOT_FOUND;
                return jsonResult(toPublicDocument(doc));
            } catch {
                return INTERNAL_ERROR;
            }
        },
    );

    server.registerTool(
        `publish_${label}`,
        {
            description: `Publishes a ${label}: copies its draft content into the published fields the public site/API renders.`,
            inputSchema: { documentId: z.string() },
            outputSchema: documentSchema,
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
        },
        async (args: any, extra: any) => {
            const teamId = getTeamId(extra);
            if (!teamId) return AUTH_ERROR;
            try {
                const doc = await publishDocument(kind, teamId, args.documentId);
                if (!doc) return NOT_FOUND;
                return jsonResult(toPublicDocument(doc));
            } catch {
                return INTERNAL_ERROR;
            }
        },
    );

    server.registerTool(
        `discard_${label}_draft`,
        {
            description: `Discards a ${label}'s draft changes, resetting the draft content back to whatever is currently published.`,
            inputSchema: { documentId: z.string() },
            outputSchema: documentSchema,
            annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
        },
        async (args: any, extra: any) => {
            const teamId = getTeamId(extra);
            if (!teamId) return AUTH_ERROR;
            try {
                const doc = await discardDocumentDraft(kind, teamId, args.documentId);
                if (!doc) return NOT_FOUND;
                return jsonResult(toPublicDocument(doc));
            } catch {
                return INTERNAL_ERROR;
            }
        },
    );

    server.registerTool(
        `delete_${label}`,
        {
            description: `Permanently deletes a ${label}.`,
            inputSchema: { documentId: z.string() },
            outputSchema: successMessageSchema,
            annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
        },
        async (args: any, extra: any) => {
            const teamId = getTeamId(extra);
            if (!teamId) return AUTH_ERROR;
            try {
                const result = await deleteDocument(kind, teamId, args.documentId);
                if (!result.ok) return NOT_FOUND;
                return jsonResult({ message: `${label} deleted.` });
            } catch {
                return INTERNAL_ERROR;
            }
        },
    );
}
