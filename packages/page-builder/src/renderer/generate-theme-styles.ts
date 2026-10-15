import convert, { HSL } from "color-convert";
import type { Theme } from "../models";

function formatHSL(hsl: HSL): string {
  return `${hsl[0]} ${hsl[1]}% ${hsl[2]}%`;
}

const SHORT_OR_LONG_HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;
const HEX_WITH_ALPHA = /^#([0-9a-f]{4}|[0-9a-f]{8})$/i;
const CSS_COLOR_FUNCTION =
  /^(oklch|oklab|lab|lch|hwb|hsla?|rgba?|color)\(\s*[-+0-9a-z%.,/\s]+\)$/i;

/**
 * Turns a theme colour into a CSS colour value, or "" when it isn't a
 * colour we can use. Hex (the stored format) is converted to hsl();
 * modern CSS colour functions such as `oklch(...)` are passed through.
 */
export function resolveThemeColor(value?: string): string {
  const color = value?.trim();
  if (!color) return "";
  if (SHORT_OR_LONG_HEX.test(color)) {
    return `hsl(${formatHSL(convert.hex.hsl(color.replace("#", "")))})`;
  }
  if (HEX_WITH_ALPHA.test(color) || CSS_COLOR_FUNCTION.test(color)) return color;
  return "";
}

/**
 * Generates full CSS color values for the custom properties every primitive
 * reads. Full colors (rather than bare HSL channels) let the renderer coexist
 * with Tailwind v4 hosts whose semantic utilities use `var(--primary)` while
 * still accepting CourseLit-derived hex theme data.
 *
 * Callers rendering more than one theme in a document should pass a unique
 * selector so one renderer cannot overwrite another renderer's variables.
 */
export function generateThemeStyles(theme: Theme, selector = ".pb-theme"): string {
  const colors = theme?.theme?.colors;
  if (!colors) {
    return "";
  }

  const { light, dark } = colors;
  if (!light || !dark) {
    return "";
  }

  const block = (c: typeof light) => `
        --background: ${resolveThemeColor(c.background)};
        --foreground: ${resolveThemeColor(c.foreground)};
        --card: ${resolveThemeColor(c.card)};
        --card-foreground: ${resolveThemeColor(c.cardForeground)};
        --popover: ${resolveThemeColor(c.popover)};
        --popover-foreground: ${resolveThemeColor(c.popoverForeground)};
        --primary: ${resolveThemeColor(c.primary)};
        --primary-foreground: ${resolveThemeColor(c.primaryForeground)};
        --secondary: ${resolveThemeColor(c.secondary)};
        --secondary-foreground: ${resolveThemeColor(c.secondaryForeground)};
        --muted: ${resolveThemeColor(c.muted)};
        --muted-foreground: ${resolveThemeColor(c.mutedForeground)};
        --accent: ${resolveThemeColor(c.accent)};
        --accent-foreground: ${resolveThemeColor(c.accentForeground)};
        --destructive: ${resolveThemeColor(c.destructive)};
        --border: ${resolveThemeColor(c.border)};
        --input: ${resolveThemeColor(c.input)};
        --ring: ${resolveThemeColor(c.ring)};
        --chart-1: ${resolveThemeColor(c.chart1)};
        --chart-2: ${resolveThemeColor(c.chart2)};
        --chart-3: ${resolveThemeColor(c.chart3)};
        --chart-4: ${resolveThemeColor(c.chart4)};
        --chart-5: ${resolveThemeColor(c.chart5)};
        --sidebar-background: ${resolveThemeColor(c.sidebar)};
        --sidebar-foreground: ${resolveThemeColor(c.sidebarForeground)};
        --sidebar-primary: ${resolveThemeColor(c.sidebarPrimary)};
        --sidebar-primary-foreground: ${resolveThemeColor(c.sidebarPrimaryForeground)};
        --sidebar-accent: ${resolveThemeColor(c.sidebarAccent)};
        --sidebar-accent-foreground: ${resolveThemeColor(c.sidebarAccentForeground)};
        --sidebar-border: ${resolveThemeColor(c.sidebarBorder)};
        --sidebar-ring: ${resolveThemeColor(c.sidebarRing)};
        --shadow-2xs: ${c.shadow2xs ?? ""};
        --shadow-xs: ${c.shadowXs ?? ""};
        --shadow-sm: ${c.shadowSm ?? ""};
        --shadow-md: ${c.shadowMd ?? ""};
        --shadow-lg: ${c.shadowLg ?? ""};
        --shadow-xl: ${c.shadowXl ?? ""};
        --shadow-2xl: ${c.shadow2xl ?? ""};
    `;

  return `
        ${selector} {
            ${block(light)}
        }
        ${selector}:is(.dark, .dark *) {
            ${block(dark)}
        }
    `;
}
