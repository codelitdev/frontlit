"use client";

import { getDefaultTheme } from "@frontlit/page-builder";
import { generateThemeStyles } from "@frontlit/page-builder/renderer";
import type { Theme } from "@frontlit/page-builder/models";
import { resolvePageTheme } from "./page-theme";

/**
 * Site chrome (chat launcher + panel) follows the **homepage** page theme —
 * the same Theme object pages resolve via `themeId` / saved style. Falls back
 * to Classic when the homepage has no theme.
 */
export function resolveSiteTheme(themeId: string | null, themeStyle: Record<string, unknown> | null): Theme {
    return resolvePageTheme(themeId, themeStyle) ?? getDefaultTheme();
}

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
export function resolveChatAccent(accentColor: string | null | undefined, theme: Theme): string {
    const trimmed = accentColor?.trim();
    if (trimmed) return trimmed;
    return theme.theme.colors.light.primary;
}

export function siteThemeStyleTag(theme: Theme): string {
    return generateThemeStyles(theme);
}
