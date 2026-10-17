import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Badge } from "@frontlit/page-builder/primitives/server";
import { getPreviewPage, getSettings } from "@/lib/api";
import { API_PUBLIC_URL } from "@/lib/config";
import { loadSiteTheme } from "@/lib/load-site-theme";
import { resolveSiteTheme } from "@/lib/site-theme";
import { SitePageRenderer } from "@/components/site-page-renderer";
import { toSiteBranding } from "@frontlit/api-contract";

interface Props {
  params: Promise<{ teamId: string; releaseId: string; slug?: string[] }>;
  searchParams: Promise<{ token?: string }>;
}

export const dynamic = "force-dynamic";

/** Previews are shared links, never search results. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

/** A pull request's pages as they'd look once merged (signed link). */
export default async function ReleasePreviewPage({ params, searchParams }: Props) {
  const [{ teamId, releaseId, slug }, { token }] = await Promise.all([
    params,
    searchParams,
  ]);
  if (!token) notFound();
  const page = await getPreviewPage(teamId, releaseId, token, (slug ?? []).join("/"));
  if (!page) notFound();
  const [settings, siteTheme] = await Promise.all([
    getSettings(teamId),
    loadSiteTheme(teamId),
  ]);
  const theme = resolveSiteTheme(siteTheme.themeId, siteTheme.themeStyle);
  return (
    <SitePageRenderer
      layout={page.layout}
      themeId={siteTheme.themeId}
      themeStyle={siteTheme.themeStyle}
      pageData={{
        teamId,
        pageSlug: page.slug,
        publicApiBaseUrl: API_PUBLIC_URL,
        ...toSiteBranding(settings),
      }}
      overlay={
        <div className="pointer-events-none fixed right-4 bottom-4 z-50">
          <Badge theme={theme.theme} variant="destructive">
            Preview · not live
          </Badge>
        </div>
      }
    />
  );
}
