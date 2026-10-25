import type { ThemeStyle } from "@frontlit/page-builder/models";
import { loadSiteTheme } from "./load-site-theme";
import { resolveSiteTheme } from "./site-theme";

/**
 * The team's theme, for server components that render page-builder
 * primitives outside the page renderer (feeds, articles, docs).
 */
export async function getTeamThemeStyle(teamId: string): Promise<ThemeStyle> {
  const { themeId, themeStyle } = await loadSiteTheme(teamId);
  return resolveSiteTheme(themeId, themeStyle).theme;
}
