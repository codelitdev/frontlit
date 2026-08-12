import type { ReactNode } from "react";
import { getPageBySlug } from "@/lib/api";
import { API_PUBLIC_URL } from "@/lib/config";
import { loadSiteTheme } from "@/lib/load-site-theme";
import { SitePageRenderer } from "@/components/site-page-renderer";

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
    children: ReactNode;
}) {
    const [requestedPage, siteTheme] = await Promise.all([
        getPageBySlug(teamId, pageSlug),
        loadSiteTheme(teamId),
    ]);
    const page =
        requestedPage ??
        (pageSlug ? await getPageBySlug(teamId, "") : requestedPage);

    return (
        <SitePageRenderer
            // A site can expose system content before its layout is
            // published. An empty layout still supplies the team theme.
            layout={page?.layout ?? []}
            themeId={siteTheme.themeId}
            themeStyle={siteTheme.themeStyle}
            pageData={{
                pageType: page?.type ?? "site",
                teamId,
                pageSlug,
                publicApiBaseUrl: API_PUBLIC_URL,
            }}
        >
            {children}
        </SitePageRenderer>
    );
}
