import convert, { HSL } from "color-convert";
import type { Theme } from "../models";

function formatHSL(hsl: HSL): string {
    return `${hsl[0]} ${hsl[1]}% ${hsl[2]}%`;
}

function hslFromHex(hex?: string): string {
    if (!hex) return "";
    try {
        return formatHSL(convert.hex.hsl(hex.replace("#", "")));
    } catch {
        return "";
    }
}

/**
 * Generates the CSS custom properties (scoped under `.pb-theme`, with the
 * dark palette active when `.dark` is on the same element or an ancestor)
 * that every primitive and block reads its colors from. Adapted from
 * CourseLit's `generateThemeStyles`.
 */
export function generateThemeStyles(theme: Theme): string {
    const colors = theme?.theme?.colors;
    if (!colors) {
        return "";
    }

    const { light, dark } = colors;
    if (!light || !dark) {
        return "";
    }

    const block = (c: typeof light) => `
        --background: ${hslFromHex(c.background)};
        --foreground: ${hslFromHex(c.foreground)};
        --card: ${hslFromHex(c.card)};
        --card-foreground: ${hslFromHex(c.cardForeground)};
        --popover: ${hslFromHex(c.popover)};
        --popover-foreground: ${hslFromHex(c.popoverForeground)};
        --primary: ${hslFromHex(c.primary)};
        --primary-foreground: ${hslFromHex(c.primaryForeground)};
        --secondary: ${hslFromHex(c.secondary)};
        --secondary-foreground: ${hslFromHex(c.secondaryForeground)};
        --muted: ${hslFromHex(c.muted)};
        --muted-foreground: ${hslFromHex(c.mutedForeground)};
        --accent: ${hslFromHex(c.accent)};
        --accent-foreground: ${hslFromHex(c.accentForeground)};
        --destructive: ${hslFromHex(c.destructive)};
        --border: ${hslFromHex(c.border)};
        --input: ${hslFromHex(c.input)};
        --ring: ${hslFromHex(c.ring)};
        --chart-1: ${hslFromHex(c.chart1)};
        --chart-2: ${hslFromHex(c.chart2)};
        --chart-3: ${hslFromHex(c.chart3)};
        --chart-4: ${hslFromHex(c.chart4)};
        --chart-5: ${hslFromHex(c.chart5)};
        --sidebar-background: ${hslFromHex(c.sidebar)};
        --sidebar-foreground: ${hslFromHex(c.sidebarForeground)};
        --sidebar-primary: ${hslFromHex(c.sidebarPrimary)};
        --sidebar-primary-foreground: ${hslFromHex(c.sidebarPrimaryForeground)};
        --sidebar-accent: ${hslFromHex(c.sidebarAccent)};
        --sidebar-accent-foreground: ${hslFromHex(c.sidebarAccentForeground)};
        --sidebar-border: ${hslFromHex(c.sidebarBorder)};
        --sidebar-ring: ${hslFromHex(c.sidebarRing)};
        --shadow-2xs: ${c.shadow2xs ?? ""};
        --shadow-xs: ${c.shadowXs ?? ""};
        --shadow-sm: ${c.shadowSm ?? ""};
        --shadow-md: ${c.shadowMd ?? ""};
        --shadow-lg: ${c.shadowLg ?? ""};
        --shadow-xl: ${c.shadowXl ?? ""};
        --shadow-2xl: ${c.shadow2xl ?? ""};
    `;

    return `
        .pb-theme {
            ${block(light)}
        }
        .pb-theme:is(.dark, .dark *) {
            ${block(dark)}
        }
    `;
}
