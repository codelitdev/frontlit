import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Badge } from "@frontlit/page-builder/primitives/server";
import { BUILD_TEAM_ID, getPreviewPage, getPreviewSettings } from "@/lib/api";
import { API_PUBLIC_URL } from "@/lib/config";
import { resolveSiteTheme } from "@/lib/site-theme";
import { SitePageRenderer } from "@/components/site-page-renderer";
import { toSiteBranding } from "@frontlit/api-contract";

interface Props {
  params: Promise<{ teamId: string; releaseId: string; slug?: string[] }>;
  searchParams: Promise<{ token?: string }>;
}

/** Previews are shared links, never search results. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export function generateStaticParams() {
  return [{ releaseId: BUILD_TEAM_ID, slug: [] }];
}

/** A pull request's pages as they'd look once merged (signed link). Read
 * per request with the link's token; never cached. */
export default function ReleasePreviewPage(props: Props) {
  return (
    <Suspense fallback={null}>
      <ReleasePreview {...props} />
    </Suspense>
  );
}

async function ReleasePreview({ params, searchParams }: Props) {
  const [{ teamId, releaseId, slug }, { token }] = await Promise.all([
    params,
    searchParams,
  ]);
  if (!token) notFound();
  const page = await getPreviewPage(teamId, releaseId, token, (slug ?? []).join("/"));
  if (!page) notFound();
  // The preview's own site.json theme, if it has one.
  const settings = await getPreviewSettings(teamId, { release: releaseId, token });
  const siteTheme = {
    themeId: settings?.themeId ?? null,
    themeStyle: settings?.theme ?? null,
  };
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
