import { z } from "zod";

/** Blog posts, help docs and changelog entries share one engine
 * (architecture.md §5) and differ only in kind-specific `meta`. */
export const documentKinds = ["blog", "doc", "changelog"] as const;
export type DocumentKind = (typeof documentKinds)[number];

export const documentStatusSchema = z.enum(["draft", "published", "published_with_changes"]);

/** Matches `@frontlit/text-editor`'s `TextEditorContent` — a TipTap JSON
 * document. Kept loose (`z.record(z.any())` per node) since node shapes are
 * intentionally block/mark-specific and owned by the editor package.
 * `content` defaults to `[]`: TipTap's `editor.getJSON()` omits the array
 * entirely for a genuinely empty document rather than emitting `[]`. */
export const textEditorContentSchema = z.object({
    type: z.literal("doc"),
    content: z.array(z.record(z.any())).default([]),
});

/** Builds the wire schema for one document kind, given its `meta` schema
 * (e.g. `{ tags: string[] }` for blog). Used once per kind so the OpenAPI
 * spec and generated types show concrete, kind-named shapes rather than a
 * generic `Document<meta: any>`. */
export function makeDocumentSchema<M extends z.ZodTypeAny>(metaSchema: M) {
    return z.object({
        documentId: z.string(),
        slug: z.string(),
        status: documentStatusSchema,
        publishedAt: z.string().nullable().optional(),
        // Published fields — what the public site renders.
        title: z.string().nullable().optional(),
        content: textEditorContentSchema.nullable().optional(),
        excerpt: z.string().nullable().optional(),
        featuredImage: z.record(z.any()).nullable().optional(),
        meta: metaSchema,
        // Draft fields — what the dashboard editor reads and writes.
        draftTitle: z.string(),
        draftContent: textEditorContentSchema,
        draftExcerpt: z.string().nullable().optional(),
        draftFeaturedImage: z.record(z.any()).nullable().optional(),
        draftMeta: metaSchema,
        createdAt: z.string().nullable(),
        updatedAt: z.string().nullable(),
    });
}

export function makeCreateDocumentBodySchema<M extends z.ZodTypeAny>(metaSchema: M) {
    return z.object({
        title: z.string().min(1),
        // `.default({})` (not `.optional()`): when the caller omits `meta`
        // entirely, this still runs `{}` through `metaSchema` so its own
        // per-field defaults (e.g. `labels: []`, `tags: []`, `order: 0`)
        // apply. `metaSchema.optional()` would skip those defaults, since
        // an absent key never reaches the nested schema to be defaulted.
        meta: metaSchema.default({}),
    });
}

/** Every field here is written to the document's *draft* columns, not the
 * published ones — see architecture.md §3. Promote with `publish`. */
export function makeUpdateDocumentBodySchema<M extends z.ZodTypeAny>(metaSchema: M) {
    return z.object({
        title: z.string().optional(),
        content: textEditorContentSchema.optional(),
        excerpt: z.string().optional(),
        featuredImage: z.record(z.any()).optional(),
        meta: metaSchema.optional(),
    });
}

export const listDocumentsQuerySchema = z.object({
    q: z.string().optional().describe("Search term matched against the document's draft title"),
    offset: z.coerce.number().int().min(1).optional(),
    itemsPerPage: z.coerce.number().int().min(1).optional(),
});
