import { z } from "zod";
import { themeReferenceSchema } from "./themes";

/** Media reference shape used across pages/documents `socialImage`/
 * `featuredImage` (architecture.md §9.2) — the branding logo re-uses it. */
const mediaRefSchema = z.record(z.string(), z.unknown());

export const teamSettingsSchema = z.object({
  title: z.string().nullable(),
  subtitle: z.string().nullable(),
  logo: mediaRefSchema.nullable(),
  themeId: themeReferenceSchema.nullable(),
  codeInjectionHead: z.string().nullable(),
  codeInjectionBody: z.string().nullable(),
  createdAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
});

export const updateTeamSettingsBodySchema = z.object({
  title: z.string().max(200).nullable().optional(),
  subtitle: z.string().max(500).nullable().optional(),
  logo: mediaRefSchema.nullable().optional(),
  themeId: themeReferenceSchema.nullable().optional(),
  // Size-capped per slot (architecture.md §12.5): arbitrary script is a
  // deliberate trust boundary, not an unbounded one.
  codeInjectionHead: z.string().max(16_384).nullable().optional(),
  codeInjectionBody: z.string().max(16_384).nullable().optional(),
});

/** What `apps/sites` reads for a tenant's site shell — branding and
 * injection snippets are public by nature (they ship in the page HTML),
 * nothing else (architecture.md §12.5). */
export const publicTeamSettingsSchema = z.object({
  title: z.string().nullable(),
  subtitle: z.string().nullable(),
  logo: mediaRefSchema.nullable(),
  themeId: themeReferenceSchema.nullable(),
  theme: z.record(z.any()).nullable(),
  codeInjectionHead: z.string().nullable(),
  codeInjectionBody: z.string().nullable(),
  /** From the live release's site.json; applied when no page matches. */
  redirects: z
    .array(
      z.object({ from: z.string(), to: z.string(), permanent: z.boolean().optional() }),
    )
    .optional(),
});
