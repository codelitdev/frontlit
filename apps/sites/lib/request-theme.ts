import { cache } from "react";
import { headers } from "next/headers";
import type { ThemeStyle } from "@frontlit/page-builder/models";
import { loadSiteTheme } from "./load-site-theme";
import { resolveSiteTheme } from "./site-theme";

/**
 * The requesting team's theme, for server components that render page-builder
 * primitives outside the page renderer (feeds, articles, docs). The proxy
 * tags every rewritten request with the team it resolved.
 */
export const getRequestThemeStyle = cache(async (): Promise<ThemeStyle> => {
  const teamId = (await headers()).get("x-frontlit-team-id");
  const { themeId, themeStyle } = teamId
    ? await loadSiteTheme(teamId)
    : { themeId: null, themeStyle: null };
  return resolveSiteTheme(themeId, themeStyle).theme;
});
