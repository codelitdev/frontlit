import { z } from "zod";
import { pageWidthSchema, sectionPaddingYSchema } from "./fields";

const fontSize = z.enum([
  "text-xs",
  "text-sm",
  "text-base",
  "text-lg",
  "text-xl",
  "text-2xl",
  "text-3xl",
  "text-4xl",
  "text-5xl",
  "text-6xl",
  "text-7xl",
  "text-8xl",
  "text-9xl",
]);
const fontWeight = z.enum([
  "font-thin",
  "font-extralight",
  "font-light",
  "font-normal",
  "font-medium",
  "font-semibold",
  "font-bold",
  "font-extrabold",
  "font-black",
]);
const borderRadius = z.enum([
  "rounded-none",
  "rounded-sm",
  "rounded",
  "rounded-md",
  "rounded-lg",
  "rounded-xl",
  "rounded-2xl",
  "rounded-3xl",
  "rounded-full",
]);
const shadow = z.enum([
  "shadow-2xs",
  "shadow-xs",
  "shadow-sm",
  "shadow-md",
  "shadow-lg",
  "shadow-xl",
  "shadow-2xl",
  "shadow-none",
]);
const paddingX = z.enum([
  "px-0",
  "px-1",
  "px-2",
  "px-3",
  "px-4",
  "px-5",
  "px-6",
  "px-8",
  "px-10",
  "px-12",
  "px-16",
  "px-20",
  "px-24",
  "px-32",
  "px-40",
  "px-48",
  "px-56",
  "px-64",
]);
const paddingY = z.enum([
  "py-0",
  "py-1",
  "py-2",
  "py-3",
  "py-4",
  "py-5",
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

const typography = z
  .object({
    fontFamily: z.string(),
    fontSize,
    fontWeight,
    lineHeight: z
      .enum([
        "leading-none",
        "leading-tight",
        "leading-snug",
        "leading-normal",
        "leading-relaxed",
        "leading-loose",
      ])
      .optional(),
    letterSpacing: z
      .enum([
        "tracking-tighter",
        "tracking-tight",
        "tracking-normal",
        "tracking-wide",
        "tracking-wider",
        "tracking-widest",
      ])
      .optional(),
    textTransform: z
      .enum(["uppercase", "lowercase", "capitalize", "normal-case"])
      .optional(),
    textDecoration: z.enum(["underline", "line-through", "no-underline"]).optional(),
    textOverflow: z.enum(["truncate", "text-ellipsis", "text-clip"]).optional(),
    fluid: z.object({ min: z.number(), max: z.number() }).strict().optional(),
  })
  .strict();

const border = z
  .object({
    width: z
      .enum(["border", "border-0", "border-2", "border-4", "border-8"])
      .optional(),
    radius: borderRadius.optional(),
    style: z
      .enum([
        "border-solid",
        "border-dashed",
        "border-dotted",
        "border-double",
        "border-hidden",
        "border-none",
      ])
      .optional(),
  })
  .strict();
const padding = z.object({ x: paddingX.optional(), y: paddingY.optional() }).strict();
const disabled = z
  .object({
    color: z.string().optional(),
    background: z.string().optional(),
    border: z.string().optional(),
    opacity: z.enum(["opacity-50", "opacity-75", "opacity-100"]).optional(),
    cursor: z
      .enum(["cursor-not-allowed", "cursor-default", "cursor-pointer"])
      .optional(),
  })
  .strict();
const surface = z
  .object({
    padding: padding.optional(),
    border: border.optional(),
    shadow: shadow.optional(),
    custom: z.string().optional(),
  })
  .strict();

const colorKeys = [
  "background",
  "foreground",
  "card",
  "cardForeground",
  "popover",
  "popoverForeground",
  "primary",
  "primaryForeground",
  "secondary",
  "secondaryForeground",
  "muted",
  "mutedForeground",
  "accent",
  "accentForeground",
  "destructive",
  "border",
  "input",
  "ring",
  "chart1",
  "chart2",
  "chart3",
  "chart4",
  "chart5",
  "sidebar",
  "sidebarForeground",
  "sidebarPrimary",
  "sidebarPrimaryForeground",
  "sidebarAccent",
  "sidebarAccentForeground",
  "sidebarBorder",
  "sidebarRing",
  "shadow2xs",
  "shadowXs",
  "shadowSm",
  "shadowMd",
  "shadowLg",
  "shadowXl",
  "shadow2xl",
] as const;
const colors = z
  .object(
    Object.fromEntries(colorKeys.map((key) => [key, z.string()])) as {
      [K in (typeof colorKeys)[number]]: z.ZodString;
    },
  )
  .strict();

/** Runtime schema for `ThemeStyle`. */
export const themeStyleSchema = z
  .object({
    colors: z.object({ light: colors, dark: colors }).strict(),
    typography: z
      .object({
        preheader: typography,
        display: typography.optional(),
        header1: typography,
        header2: typography,
        header3: typography,
        header4: typography,
        subheader1: typography,
        subheader2: typography,
        text1: typography,
        text2: typography,
        link: typography,
        button: typography,
        input: typography,
        caption: typography,
        code: typography.optional(),
      })
      .strict(),
    highlight: z.enum(["color", "marker"]).optional(),
    interactives: z
      .object({
        button: surface.extend({ disabled: disabled.optional() }).strict(),
        menu: surface
          .extend({ item: surface.omit({ shadow: true }).optional() })
          .optional(),
        dialog: surface.optional(),
        popover: surface.optional(),
        tooltip: surface.optional(),
        link: z
          .object({
            padding: padding.optional(),
            border: border.optional(),
            textShadow: z.string().optional(),
            custom: z.string().optional(),
            disabled: disabled.optional(),
          })
          .strict(),
        card: surface,
        input: surface
          .extend({
            borderRadius: borderRadius.optional(),
            disabled: disabled.optional(),
          })
          .strict(),
      })
      .strict(),
    structure: z
      .object({
        page: z.object({ width: pageWidthSchema }).strict(),
        section: z
          .object({
            dividers: z.boolean().optional(),
            padding: z
              .object({
                x: z.enum([
                  "px-0",
                  "px-4",
                  "px-6",
                  "px-8",
                  "px-10",
                  "px-12",
                  "px-16",
                  "px-20",
                  "px-24",
                  "px-32",
                  "px-40",
                  "px-48",
                  "px-56",
                  "px-64",
                ]),
                y: sectionPaddingYSchema,
              })
              .strict(),
          })
          .strict(),
      })
      .strict(),
  })
  .strict();
