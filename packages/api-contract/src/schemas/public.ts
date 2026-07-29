import { z } from "zod";
import { textEditorContentSchema } from "./documents";
import { widgetInstanceSchema } from "./pages";

/** Published-only projection of a document, served by the unauthenticated
 * `/public/*` API group (architecture.md §5.4). Never includes `draft*`
 * fields or internal ids. */
export function makePublicDocumentSchema<M extends z.ZodTypeAny>(metaSchema: M) {
    return z.object({
        documentId: z.string(),
        slug: z.string(),
        title: z.string().nullable(),
        content: textEditorContentSchema.nullable(),
        excerpt: z.string().nullable(),
        featuredImage: z.record(z.any()).nullable(),
        meta: metaSchema,
        publishedAt: z.string().nullable(),
        updatedAt: z.string().nullable(),
    });
}

/** Published-only projection of a page, served by `GET
 * /public/:teamId/pages/:slug` (architecture.md §5.4). */
export const publicPageSchema = z.object({
    pageId: z.string(),
    name: z.string(),
    type: z.enum(["site", "blog", "landing", "post", "custom"]),
    slug: z.string(),
    layout: z.array(widgetInstanceSchema),
    // A built-in id such as "learning", or a saved theme's public `thm_*`
    // id. Saved theme styles are resolved server-side below; built-ins are
    // resolved by apps/sites from the page-builder catalog.
    themeId: z.string().nullable(),
    // `null` means the logical id refers to a built-in theme (or no theme).
    theme: z.record(z.any()).nullable(),
    title: z.string().nullable(),
    description: z.string().nullable(),
    socialImage: z.record(z.any()).nullable(),
    robotsAllowed: z.boolean().nullable(),
    publishedAt: z.string().nullable(),
    updatedAt: z.string().nullable(),
});

export const sitemapEntryKindSchema = z.enum(["page", "blog", "doc", "changelog"]);

export const sitemapEntrySchema = z.object({
    kind: sitemapEntryKindSchema,
    path: z.string(),
    lastmod: z.string().nullable(),
});

export const sitemapResponseSchema = z.object({
    items: z.array(sitemapEntrySchema),
});
