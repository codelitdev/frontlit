import { generateThemeStyles, resolveTheme } from "@frontlit/page-builder/theme";
import type { Theme } from "@frontlit/page-builder/models";

/**
 * Site chrome (page, chat launcher + panel) follows the team-level FrontLit
 * theme. Falls back to Classic when the site has no explicit theme.
 */
export const resolveSiteTheme = resolveTheme;

/** Light-palette hex colors used by the floating launcher (inline styles). */
export function siteThemePalette(theme: Theme) {
  const light = theme.theme.colors.light;
  return {
    primary: light.primary,
    primaryForeground: light.primaryForeground,
    background: light.background,
    foreground: light.foreground,
    card: light.card,
    muted: light.muted,
    mutedForeground: light.mutedForeground,
    border: light.border,
    input: light.input,
    destructive: light.destructive,
  };
}

/**
 * Effective accent for the launcher/header: explicit chatbot accent wins,
 * otherwise the site theme primary (so the bot matches page buttons).
 */
export function resolveChatAccent(
  accentColor: string | null | undefined,
  theme: Theme,
): string {
  const trimmed = accentColor?.trim();
  if (trimmed) return trimmed;
  return theme.theme.colors.light.primary;
}

export function siteThemeStyleTag(theme: Theme, selector: string): string {
  return generateThemeStyles(theme, selector);
}
