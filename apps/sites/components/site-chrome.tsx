import type { ReactNode } from "react";
import { getPageBySlug, getSettings, getSiteChrome } from "@/lib/api";
import { API_PUBLIC_URL } from "@/lib/config";
import { toSiteBranding } from "@frontlit/api-contract";
import { loadSiteTheme } from "@/lib/load-site-theme";
import { SitePageRenderer } from "@/components/site-page-renderer";
import { loadDataSlots } from "@frontlit/page-builder/data-slots";
import { CONTENT_FEED_SLOT, contentFeedLoader } from "@/components/content-feed";

/**
 * Wraps built-in content pages in the team's published shared site chrome.
 * Header and footer settings are team-level and are hydrated into the
 * requested page layout by the public API.
 */
export async function SiteChrome({
  teamId,
  pageSlug = "",
  children,
}: {
  teamId: string;
  /** Layout-bearing page to render. Detail routes leave this at the
   * homepage; standard indexes pass their reserved slug. */
  pageSlug?: string;
  children?: ReactNode;
}) {
  const [layout, settings, siteTheme] = await Promise.all([
    // Detail routes only need the header and footer around their content.
    pageSlug ? pageLayout(teamId, pageSlug) : getSiteChrome(teamId),
    getSettings(teamId),
    loadSiteTheme(teamId),
  ]);
  const pageData = {
    teamId,
    pageSlug,
    publicApiBaseUrl: API_PUBLIC_URL,
    ...toSiteBranding(settings),
  };
  const dataSlots = await loadDataSlots(
    layout,
    { [CONTENT_FEED_SLOT]: contentFeedLoader },
    pageData,
  );

  return (
    <SitePageRenderer
      // A site can expose system content before its layout is
      // published. An empty layout still supplies the team theme.
      layout={layout}
      themeId={siteTheme.themeId}
      themeStyle={siteTheme.themeStyle}
      pageData={pageData}
      dataSlots={dataSlots}
    >
      {children}
    </SitePageRenderer>
  );
}

/** A standard index page's layout; before it's published, the homepage's. */
async function pageLayout(teamId: string, slug: string) {
  const page = (await getPageBySlug(teamId, slug)) ?? (await getPageBySlug(teamId, ""));
  return page?.layout ?? [];
}
