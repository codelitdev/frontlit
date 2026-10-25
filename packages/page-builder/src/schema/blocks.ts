import { z } from "zod";
import {
  alignmentSchema,
  commonSettingsShape,
  horizontalAlignmentSchema,
  hrefSchema,
  iconSchema,
  titleSettingsShape,
  type FieldKinds,
} from "./fields";
import { bannerDefaults } from "../blocks/banner/defaults";
import { codeSnippetDefaults } from "../blocks/code-snippet/defaults";
import { contentDefaults } from "../blocks/content/defaults";
import { emailFormDefaults } from "../blocks/email-form/defaults";
import { embedDefaults } from "../blocks/embed/defaults";
import { faqDefaults } from "../blocks/faq/defaults";
import { featuredDefaults } from "../blocks/featured/defaults";
import { footerDefaults } from "../blocks/footer/defaults";
import { gridDefaults } from "../blocks/grid/defaults";
import { headerDefaults } from "../blocks/header/defaults";
import { heroDefaults } from "../blocks/hero/defaults";
import { marqueeDefaults } from "../blocks/marquee/defaults";
import { mediaDefaults } from "../blocks/media/defaults";
import { pricingDefaults } from "../blocks/pricing/defaults";
import { richTextDefaults } from "../blocks/rich-text/defaults";
import { supportFormDefaults } from "../blocks/support-form/defaults";

const radius = z.number().int().min(0).max(8);
const nonNegative = z.number().min(0);

/** Settings schema for every built-in block, written against `FieldKinds`
 * so one definition covers stored settings and page files. Keys are
 * declared in the order the serializer writes them. */
export function blockSettingsSchemas(k: FieldKinds) {
  const common = commonSettingsShape(k);
  return {
    header: z
      .object({
        ...common,
        layout: z.enum(["fixed", "floating", "centered"]).optional(),
        links: k
          .list(
            z.object({
              label: z.string(),
              href: hrefSchema,
              isButton: z.boolean().optional(),
            }),
          )
          .optional(),
        ctaLabel: z.string().optional(),
        ctaHref: hrefSchema.optional(),
        linkAlignment: horizontalAlignmentSchema.optional(),
        backdropBlur: z.boolean().optional(),
        logoCorners: radius.optional(),
        githubRepo: z
          .string()
          .optional()
          .describe(
            'GitHub repository as "owner/repo" or a github.com URL. Shows a GitHub icon link; other values are ignored.',
          ),
        showGithubStars: z
          .boolean()
          .optional()
          .describe("Show the repository's star count next to the GitHub icon."),
      })
      .strict(),
    hero: z
      .object({
        ...common,
        layout: z.enum(["normal", "card", "centered", "media-below"]).optional(),
        preTitle: z.string().optional(),
        title: z
          .string()
          .optional()
          .describe("Wrap words in *asterisks* to highlight them."),
        ...titleSettingsShape,
        description: k.richText.optional(),
        buttonCaption: z.string().optional(),
        buttonAction: hrefSchema.optional(),
        secondaryButtonCaption: z.string().optional(),
        secondaryButtonAction: hrefSchema.optional(),
        smallPrint: z.string().optional(),
        command: z.string().optional(),
        media: k.media.optional(),
        youtubeLink: z.string().optional(),
        alignment: alignmentSchema.optional(),
        contentAlignment: alignmentSchema.optional(),
        mediaRadius: radius.optional(),
      })
      .strict(),
    content: z
      .object({
        ...common,
        layout: z.enum(["side", "stacked", "overlay"]).optional(),
        title: z.string().optional(),
        ...titleSettingsShape,
        body: k.richText.optional(),
        media: k.media.optional(),
        alignment: z.enum(["left", "right"]).optional(),
        headerAlignment: alignmentSchema.optional(),
        mediaRadius: radius.optional(),
      })
      .strict(),
    "rich-text": z
      .object({
        ...common,
        text: k.richText.optional(),
        alignment: horizontalAlignmentSchema.optional(),
      })
      .strict(),
    featured: z
      .object({
        ...common,
        layout: z.enum(["grid", "list", "compact", "numbered"]).optional(),
        title: z.string().optional(),
        ...titleSettingsShape,
        description: k.richText.optional(),
        headerAlignment: alignmentSchema.optional(),
        items: z
          .array(
            z
              .object({
                title: z.string(),
                description: z.string().optional(),
                icon: iconSchema.optional(),
              })
              .strict(),
          )
          .optional(),
      })
      .strict(),
    grid: z
      .object({
        ...common,
        title: z.string().optional(),
        ...titleSettingsShape,
        description: k.richText.optional(),
        headerAlignment: alignmentSchema.optional(),
        buttonCaption: z.string().optional(),
        buttonAction: hrefSchema.optional(),
        columns: z.union([z.literal(2), z.literal(3)]).optional(),
        items: z
          .array(
            z
              .object({
                title: z.string(),
                description: z.string().optional(),
                icon: iconSchema.optional(),
                media: k.media.optional(),
                mediaAlignment: z.enum(["top", "bottom", "overlay"]).optional(),
                buttonCaption: z.string().optional(),
                buttonAction: hrefSchema.optional(),
              })
              .strict(),
          )
          .optional(),
      })
      .strict(),
    media: z
      .object({
        ...common,
        media: k.media.optional(),
        youtubeLink: z.string().optional(),
        mediaRadius: radius.optional(),
        aspectRatio: z.string().optional().describe('e.g. "16/9", "4/3", "1/1".'),
        objectFit: z
          .enum(["cover", "contain", "fill", "none", "scale-down"])
          .optional(),
        hasBorder: z.boolean().optional(),
        playVideoInModal: z.boolean().optional(),
      })
      .strict(),
    marquee: z
      .object({
        ...common,
        items: k
          .list(
            z.object({
              text: z.string().optional(),
              href: hrefSchema.optional(),
              icon: iconSchema.optional(),
            }),
          )
          .optional(),
        direction: z.enum(["left", "right"]).optional(),
        speed: nonNegative.optional().describe("Pixels per second."),
        pauseOnHover: z.boolean().optional(),
        fadeWidth: nonNegative.optional(),
        itemBackgroundColor: z.string().optional(),
        itemForegroundColor: z.string().optional(),
        itemBorderColor: z.string().optional(),
        itemBorderRadius: nonNegative.optional(),
        itemBorderWidth: nonNegative.optional(),
        itemBorderStyle: z
          .enum(["solid", "dashed", "dotted", "double", "none"])
          .optional(),
      })
      .strict(),
    pricing: z
      .object({
        ...common,
        layout: z.enum(["grid", "stacked", "highlight"]).optional(),
        title: z.string().optional(),
        ...titleSettingsShape,
        description: k.richText.optional(),
        headerAlignment: alignmentSchema.optional(),
        pricingSwitcher: z
          .boolean()
          .optional()
          .describe("Show a Monthly/Yearly switch above the plans."),
        monthlyPriceCaption: z.string().optional().describe('Defaults to "Monthly".'),
        yearlyPriceCaption: z
          .string()
          .optional()
          .describe('Defaults to "Yearly", e.g. "Yearly (2 months free)".'),
        defaultPeriod: z
          .enum(["monthly", "yearly"])
          .optional()
          .describe("Period selected on load. Defaults to yearly."),
        tiers: z
          .array(
            z
              .object({
                name: z.string(),
                price: z
                  .string()
                  .describe(
                    'Display string, e.g. "$29/month". The monthly price when pricingSwitcher is on.',
                  ),
                priceYearly: z
                  .string()
                  .optional()
                  .describe(
                    'Shown when the switch is on Yearly, e.g. "$290/year". Falls back to price.',
                  ),
                description: z.string().optional(),
                features: z.array(z.string()),
                buttonCaption: z.string().optional(),
                buttonAction: hrefSchema.optional(),
                // Yearly button link. Falls back to buttonAction.
                buttonActionYearly: hrefSchema.optional(),
                highlighted: z.boolean().optional(),
              })
              .strict(),
          )
          .optional(),
      })
      .strict(),
    faq: z
      .object({
        ...common,
        layout: z.enum(["list", "cards", "columns"]).optional(),
        title: z.string().optional(),
        ...titleSettingsShape,
        headerAlignment: alignmentSchema.optional(),
        items: k
          .list(z.object({ question: z.string(), answer: z.string() }))
          .optional(),
      })
      .strict(),
    banner: z
      .object({
        ...common,
        layout: z.enum(["stacked", "split", "boxed"]).optional(),
        title: z.string().optional(),
        ...titleSettingsShape,
        description: k.richText.optional(),
        buttonCaption: z.string().optional(),
        buttonAction: hrefSchema.optional(),
        secondaryButtonCaption: z.string().optional(),
        secondaryButtonAction: hrefSchema.optional(),
        contentAlignment: alignmentSchema.optional(),
      })
      .strict(),
    "email-form": z
      .object({
        ...common,
        layout: z.enum(["stacked", "split", "inline"]).optional(),
        title: z.string().optional(),
        ...titleSettingsShape,
        description: k.richText.optional(),
        buttonCaption: z.string().optional(),
        successMessage: z.string().optional(),
        alignment: alignmentSchema.optional(),
      })
      .strict(),
    "support-form": z
      .object({
        ...common,
        layout: z.enum(["stacked"]).optional(),
        title: z.string().optional(),
        ...titleSettingsShape,
        description: k.richText.optional(),
        buttonCaption: z.string().optional(),
        successMessage: z.string().optional(),
        alignment: alignmentSchema.optional(),
      })
      .strict(),
    embed: z
      .object({
        ...common,
        contentType: z.enum(["url", "script"]).optional(),
        content: z.string().optional().describe("A URL, or an iframe/script snippet."),
        aspectRatio: z.enum(["16:9", "4:3", "1:1", "default"]).optional(),
        height: nonNegative
          .optional()
          .describe('Height in px when aspectRatio is "default".'),
      })
      .strict(),
    "code-snippet": z
      .object({
        ...common,
        code: z.string().optional(),
        showPrompt: z.boolean().optional(),
        caption: z.string().optional(),
        contentAlignment: alignmentSchema.optional(),
      })
      .strict(),
    footer: z
      .object({
        ...common,
        layout: z.enum(["columns", "centered", "minimal"]).optional(),
        tagline: z.string().optional(),
        columns: k
          .list(
            z.object({
              title: z.string(),
              links: k.list(z.object({ label: z.string(), href: hrefSchema })),
            }),
          )
          .optional(),
        copyrightText: z.string().optional(),
        showThemeSwitcher: z.boolean().optional(),
      })
      .strict(),
  };
}

export type BlockName = keyof ReturnType<typeof blockSettingsSchemas>;

/** Defaults the renderer merges under stored settings (`{...defaults, ...settings}`).
 * A setting equal to its default is omitted from canonical output. */
export const blockDefaults: Record<BlockName, Record<string, unknown>> = {
  header: headerDefaults,
  hero: heroDefaults,
  content: contentDefaults,
  "rich-text": richTextDefaults,
  featured: featuredDefaults,
  grid: gridDefaults,
  media: mediaDefaults,
  marquee: marqueeDefaults,
  pricing: pricingDefaults,
  faq: faqDefaults,
  banner: bannerDefaults,
  "email-form": emailFormDefaults,
  "support-form": supportFormDefaults,
  embed: embedDefaults,
  "code-snippet": codeSnippetDefaults,
  footer: footerDefaults,
};

/** Site chrome: lives in `site.json`, never in a page file. */
export const CHROME_BLOCK_NAMES = ["header", "footer"] as const;
/** Page-file name of the FrontLit content feed (a `data-slot` when stored). */
export const CONTENT_FEED_BLOCK = "content-feed" as const;
export const DATA_SLOT_BLOCK = "data-slot" as const;
