import type { WidgetConfig } from "@/embed/types";
import { getChatbotSettings } from "./api";
import { EMBED_ORIGIN } from "./config";
import { loadSiteTheme } from "./load-site-theme";
import { resolveChatAccent, resolveSiteTheme } from "./site-theme";

/**
 * Settings the embed loader needs to draw the launcher and open the chat
 * (docs/embedded-support.md §6.3). Served at `embed.<domain>/<teamId>/config`
 * for external sites, and inlined into `init` on FrontLit-hosted sites.
 * Built from cached reads tagged `shell:<teamId>`, so saving the chatbot
 * settings refreshes both. Null for an unknown team.
 */
export async function getWidgetConfig(teamId: string): Promise<WidgetConfig | null> {
  const [settings, siteTheme] = await Promise.all([
    getChatbotSettings(teamId),
    loadSiteTheme(teamId),
  ]);
  if (!settings) return null;
  if (!settings.enabled) return { enabled: false };
  const theme = resolveSiteTheme(siteTheme.themeId, siteTheme.themeStyle);
  const light = theme.theme.colors.light;
  const style = settings.widgetStyle;
  return {
    enabled: true,
    name: settings.name || "Chat",
    variant: settings.variant ?? "bubble",
    style: {
      bubbleShape: style?.bubbleShape,
      bubbleIcon: style?.bubbleIcon,
      bubbleSize: style?.bubbleSize,
      inputRadius: style?.inputRadius,
      inputPlaceholder: style?.inputPlaceholder ?? null,
      inputWidth: style?.inputWidth,
    },
    colors: {
      primary: resolveChatAccent(settings.accentColor, theme),
      primaryForeground: light.primaryForeground,
      card: light.card,
      border: light.border,
      mutedForeground: light.mutedForeground,
    },
    chatUrl: `${EMBED_ORIGIN}/${encodeURIComponent(teamId)}/chat`,
  };
}
