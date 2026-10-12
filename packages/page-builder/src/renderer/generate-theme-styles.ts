import convert, { HSL } from "color-convert";
import type { Theme } from "../models";

function formatHSL(hsl: HSL): string {
  return `${hsl[0]} ${hsl[1]}% ${hsl[2]}%`;
}

function cssColorFromHex(hex?: string): string {
  if (!hex) return "";
  try {
    return `hsl(${formatHSL(convert.hex.hsl(hex.replace("#", "")))})`;
  } catch {
    return "";
  }
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
        --background: ${cssColorFromHex(c.background)};
        --foreground: ${cssColorFromHex(c.foreground)};
        --card: ${cssColorFromHex(c.card)};
        --card-foreground: ${cssColorFromHex(c.cardForeground)};
        --popover: ${cssColorFromHex(c.popover)};
        --popover-foreground: ${cssColorFromHex(c.popoverForeground)};
        --primary: ${cssColorFromHex(c.primary)};
        --primary-foreground: ${cssColorFromHex(c.primaryForeground)};
        --secondary: ${cssColorFromHex(c.secondary)};
        --secondary-foreground: ${cssColorFromHex(c.secondaryForeground)};
        --muted: ${cssColorFromHex(c.muted)};
        --muted-foreground: ${cssColorFromHex(c.mutedForeground)};
        --accent: ${cssColorFromHex(c.accent)};
        --accent-foreground: ${cssColorFromHex(c.accentForeground)};
        --destructive: ${cssColorFromHex(c.destructive)};
        --border: ${cssColorFromHex(c.border)};
        --input: ${cssColorFromHex(c.input)};
        --ring: ${cssColorFromHex(c.ring)};
        --chart-1: ${cssColorFromHex(c.chart1)};
        --chart-2: ${cssColorFromHex(c.chart2)};
        --chart-3: ${cssColorFromHex(c.chart3)};
        --chart-4: ${cssColorFromHex(c.chart4)};
        --chart-5: ${cssColorFromHex(c.chart5)};
        --sidebar-background: ${cssColorFromHex(c.sidebar)};
        --sidebar-foreground: ${cssColorFromHex(c.sidebarForeground)};
        --sidebar-primary: ${cssColorFromHex(c.sidebarPrimary)};
        --sidebar-primary-foreground: ${cssColorFromHex(c.sidebarPrimaryForeground)};
        --sidebar-accent: ${cssColorFromHex(c.sidebarAccent)};
        --sidebar-accent-foreground: ${cssColorFromHex(c.sidebarAccentForeground)};
        --sidebar-border: ${cssColorFromHex(c.sidebarBorder)};
        --sidebar-ring: ${cssColorFromHex(c.sidebarRing)};
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
