import { z } from "zod";

/** Matches `@frontlit/page-builder`'s `ThemeStyle` shape (kept loose —
 * `Record<string, any>` — since the theme's colors/typography/structure
 * settings are a large, evolving nested object owned by the page-builder
 * package, not something the API needs to validate field-by-field). */
export const themeSchema = z.object({
    themeId: z.string(),
    name: z.string(),
    style: z.record(z.any()),
    createdAt: z.string().nullable(),
    updatedAt: z.string().nullable(),
});

export const createThemeBodySchema = z.object({
    name: z.string().min(1),
    style: z.record(z.any()),
});

export const updateThemeBodySchema = z.object({
    name: z.string().optional(),
    style: z.record(z.any()).optional(),
});
