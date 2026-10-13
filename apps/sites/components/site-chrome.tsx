import type { ReactNode } from "react";
import { getPageBySlug, getSettings } from "@/lib/api";
import { API_PUBLIC_URL } from "@/lib/config";
import { loadSiteTheme } from "@/lib/load-site-theme";
import { SitePageRenderer } from "@/components/site-page-renderer";
import { loadDataSlots } from "@frontlit/page-builder/data-slots";
import {
  FRONTLIT_CONTENT_FEED_SLOT,
  frontlitContentFeedLoader,
} from "@/components/content-feed";

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
  const [requestedPage, settings, siteTheme] = await Promise.all([
    getPageBySlug(teamId, pageSlug),
    getSettings(teamId),
    loadSiteTheme(teamId),
  ]);
  const siteLogoUrl =
    typeof settings?.logo?.url === "string" ? settings.logo.url : null;
  const siteLogoAlt =
    typeof settings?.logo?.alt === "string"
      ? settings.logo.alt
      : typeof settings?.logo?.caption === "string"
        ? settings.logo.caption
        : null;
  const page =
    requestedPage ?? (pageSlug ? await getPageBySlug(teamId, "") : requestedPage);
  const pageData = {
    teamId,
    pageSlug,
    publicApiBaseUrl: API_PUBLIC_URL,
  } as const;
  const dataSlots = await loadDataSlots(
    page?.layout ?? [],
    { [FRONTLIT_CONTENT_FEED_SLOT]: frontlitContentFeedLoader },
    pageData,
  );

  return (
    <SitePageRenderer
      // A site can expose system content before its layout is
      // published. An empty layout still supplies the team theme.
      layout={page?.layout ?? []}
      themeId={siteTheme.themeId}
      themeStyle={siteTheme.themeStyle}
      pageData={pageData}
      siteLogoUrl={siteLogoUrl}
      siteLogoAlt={siteLogoAlt}
      dataSlots={dataSlots}
    >
      {children}
    </SitePageRenderer>
  );
}
