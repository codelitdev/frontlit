import { z } from "zod";

export const pageTypes = ["site", "blog", "landing", "post", "custom"] as const;

/** Matches `@frontlit/page-builder`'s `WidgetInstance` shape (kept loose —
 * `Record<string, any>` — since block settings are intentionally free-form
 * and block-specific). */
export const widgetInstanceSchema = z.object({
    widgetId: z.string(),
    name: z.string(),
    deleteable: z.boolean(),
    shared: z.boolean(),
    settings: z.record(z.any()).optional(),
});

export const pageSeoSchema = z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    socialImage: z.record(z.any()).optional(),
    robotsAllowed: z.boolean().optional(),
});

export const pageStatusSchema = z.enum(["draft", "published", "published_with_changes"]);
const themeReferenceSchema = z.string().min(1).max(128);

export const pageSchema = z.object({
    pageId: z.string(),
    name: z.string(),
    type: z.enum(pageTypes),
    slug: z.string(),
    deleteable: z.boolean(),
    status: pageStatusSchema,
    publishedAt: z.string().nullable().optional(),
    // Published fields — what the public site renders.
    layout: z.array(widgetInstanceSchema),
    themeId: themeReferenceSchema.nullable().optional(),
    title: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    socialImage: z.record(z.any()).nullable().optional(),
    robotsAllowed: z.boolean().nullable().optional(),
    // Draft fields — what the builder/editor reads and writes.
    draftLayout: z.array(widgetInstanceSchema),
    draftTitle: z.string().nullable().optional(),
    draftDescription: z.string().nullable().optional(),
    draftSocialImage: z.record(z.any()).nullable().optional(),
    draftRobotsAllowed: z.boolean().nullable().optional(),
    createdAt: z.string().nullable(),
    updatedAt: z.string().nullable(),
});

export const createPageBodySchema = z.object({
    name: z.string().min(1),
    type: z.enum(pageTypes),
    themeId: themeReferenceSchema.optional(),
});

/** Page content/SEO fields are written to draft columns and promoted by
 * publish. `themeId` and `slug` apply immediately. */
export const updatePageBodySchema = z.object({
    name: z.string().optional(),
    slug: z.string().min(1).max(200).optional(),
    layout: z.array(widgetInstanceSchema).optional(),
    themeId: themeReferenceSchema.nullable().optional(),
    title: z.string().optional(),
    description: z.string().optional(),
    socialImage: z.record(z.any()).optional(),
    robotsAllowed: z.boolean().optional(),
});

export const listPagesQuerySchema = z.object({
    type: z.enum(pageTypes).optional(),
    q: z.string().optional().describe("Search term matched against page name"),
    offset: z.coerce.number().int().min(1).optional(),
    itemsPerPage: z.coerce.number().int().min(1).optional(),
});
