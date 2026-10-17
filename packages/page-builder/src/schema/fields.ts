import { z } from "zod";
import {
  parseDocsMarkdown,
  serializeDocsMarkdown,
  validateDocsContent,
  DocsContentError,
} from "@frontlit/text-editor/docs";
import { getMediaAlt, getMediaUrl } from "../models/media";

/**
 * Block settings exist in two shapes:
 *
 * - **stored**: what the builder, REST and MCP read and write (`pages.layout`).
 *   Rich text is TipTap JSON, media is a MediaLit-style object and list items
 *   carry an `id`.
 * - **file**: what lives in a repo's `frontlit/pages/*.json`. Rich text is
 *   Markdown, media is `{ url, alt? }` and list items have no ids.
 *
 * Every block schema is written once against `FieldKinds` and instantiated
 * twice: `fileKinds` parses a file into stored settings, and `exportKinds`
 * validates stored settings and turns them into the file shape.
 */
export interface FieldKinds {
  richText: z.ZodTypeAny;
  media: z.ZodTypeAny;
  /** Wraps a list item: adds, requires or strips its `id`. */
  list: <T extends z.ZodRawShape>(item: z.ZodObject<T>) => z.ZodTypeAny;
}

const tiptapDoc = z
  .object({
    type: z.literal("doc"),
    content: z.array(z.record(z.unknown())).optional(),
  })
  .passthrough()
  .superRefine((value, ctx) => {
    const { diagnostics } = validateDocsContent(value);
    for (const item of diagnostics) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: item.message });
    }
  });

const markdown = z
  .string()
  .describe("Markdown (CommonMark + GFM).")
  .transform((value, ctx) => {
    try {
      return parseDocsMarkdown(value, { frontmatter: false }).content;
    } catch (error) {
      const message =
        error instanceof DocsContentError
          ? error.diagnostics
              .map((d) => (d.line ? `line ${d.line}: ${d.message}` : d.message))
              .join("; ")
          : "Invalid Markdown.";
      ctx.addIssue({ code: z.ZodIssueCode.custom, message });
      return z.NEVER;
    }
  });

export const fileMediaSchema = z
  .object({
    url: z.string().min(1).describe("Absolute URL, or a path relative to the repo."),
    alt: z.string().optional(),
  })
  .strict();

const storedMedia = z.record(z.unknown());

export const fileKinds: FieldKinds = {
  richText: markdown,
  media: fileMediaSchema,
  list: (item) =>
    z
      .array(item.strict())
      .transform((items) => items.map((value, i) => ({ id: String(i + 1), ...value }))),
};

export const exportKinds: FieldKinds = {
  richText: tiptapDoc.transform((value) => serializeDocsMarkdown(value).trimEnd()),
  media: storedMedia.transform((value) => {
    const url = getMediaUrl(value);
    if (!url) return undefined;
    const alt = getMediaAlt(value);
    return alt ? { url, alt } : { url };
  }),
  list: (item) =>
    z.array(
      item
        .extend({ id: z.string().optional() })
        .strict()
        .transform(({ id: _id, ...rest }) => rest),
    ),
};

export const alignmentSchema = z.enum(["left", "center", "right", "top", "bottom"]);
export const horizontalAlignmentSchema = z.enum(["left", "center", "right"]);
export const headingLevelSchema = z.enum(["h1", "h2", "h3"]);
const px = z.number().int().positive();

export const titleSettingsShape = {
  titleLevel: headingLevelSchema.optional(),
  titleSize: z
    .object({ mobile: px.optional(), tablet: px.optional(), desktop: px.optional() })
    .strict()
    .optional()
    .describe(
      "Per-breakpoint title size in px; unset breakpoints keep the theme size.",
    ),
};

export const sectionPaddingYSchema = z.enum([
  "py-0",
  "py-4",
  "py-6",
  "py-8",
  "py-10",
  "py-12",
  "py-16",
  "py-20",
  "py-24",
  "py-32",
  "py-40",
  "py-48",
  "py-56",
  "py-64",
]);
export const pageWidthSchema = z.enum([
  "max-w-2xl",
  "max-w-3xl",
  "max-w-4xl",
  "max-w-5xl",
  "max-w-6xl",
]);
const blendModeSchema = z.enum([
  "normal",
  "multiply",
  "screen",
  "overlay",
  "darken",
  "lighten",
  "color-dodge",
  "color-burn",
  "hard-light",
  "soft-light",
  "difference",
  "exclusion",
  "hue",
  "saturation",
  "color",
  "luminosity",
]);
const backgroundRepeatSchema = z.enum([
  "no-repeat",
  "repeat",
  "repeat-x",
  "repeat-y",
  "space",
  "round",
]);

function sectionBackgroundSchema(kinds: FieldKinds) {
  return z
    .object({
      type: z.enum(["color", "image", "gradient"]),
      backgroundColor: z.string().optional(),
      backgroundColorDark: z.string().optional(),
      backgroundImage: z.string().optional(),
      backgroundImageDark: z.string().optional(),
      backgroundSize: z.string().optional(),
      backgroundPosition: z.string().optional(),
      backgroundRepeat: backgroundRepeatSchema.optional(),
      backgroundAttachment: z.enum(["scroll", "fixed", "local"]).optional(),
      maskImage: z.string().optional(),
      gradientBackgroundSize: z.string().optional(),
      gradientBackgroundPosition: z.string().optional(),
      gradientBackgroundRepeat: backgroundRepeatSchema.optional(),
      gradientMaskImage: z.string().optional(),
      blur: z.number().min(0).optional(),
      overlay: z
        .object({
          color: z.string(),
          colorDark: z.string().optional(),
          blendMode: blendModeSchema,
          opacity: z
            .number()
            .min(0)
            .max(10)
            .describe("0 is invisible, 10 is fully solid."),
        })
        .strict()
        .optional(),
      media: kinds.media.optional(),
    })
    .strict();
}

/** Settings every block accepts (`WidgetDefaultSettings`), minus `layout`,
 * which each block declares with its own layout ids. */
export function commonSettingsShape(kinds: FieldKinds) {
  return {
    cssId: z
      .string()
      .optional()
      .describe("HTML id, used for in-page links like /#pricing."),
    verticalPadding: sectionPaddingYSchema.optional(),
    maxWidth: pageWidthSchema.optional(),
    background: sectionBackgroundSchema(kinds).optional(),
  };
}

/** Lucide icon name, e.g. "Globe". */
export const iconSchema = z.string().describe('Lucide icon name, e.g. "Globe".');
/** Site path, in-page anchor or absolute URL. */
export const hrefSchema = z
  .string()
  .describe('A site path ("/pricing"), anchor ("/#faq") or absolute URL.');
