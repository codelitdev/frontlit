import type { Metadata, ResolvingMetadata } from "next";
import { notFound, permanentRedirect, redirect } from "next/navigation";
import { getCanonicalHost, getPageBySlug, getSettings } from "@/lib/api";
import { pageMetadata } from "@/lib/seo";
import { organizationAndWebsiteJsonLd, serializeJsonLd } from "@frontlit/site-seo";
import { API_PUBLIC_URL } from "@/lib/config";
import { loadSiteTheme } from "@/lib/load-site-theme";
import { SitePageRenderer } from "@/components/site-page-renderer";
import { toSiteBranding } from "@frontlit/api-contract";

interface Props {
  params: Promise<{ teamId: string; slug?: string[] }>;
}

export function generateStaticParams() {
  return [{ slug: [] }];
}

async function loadPage(params: Props["params"]) {
  const { teamId, slug } = await params;
  const page = await getPageBySlug(teamId, (slug ?? []).join("/"));
  return { teamId, page };
}

export async function generateMetadata(
  { params }: Props,
  parent: ResolvingMetadata,
): Promise<Metadata> {
  const { teamId, page } = await loadPage(params);
  if (!page) return {};

  const [settings, previous] = await Promise.all([getSettings(teamId), parent]);
  return pageMetadata({
    page,
    settings,
    siteName: previous.title?.absolute || "Website",
    url: `https://${await getCanonicalHost(teamId)}/${page.slug}`,
  });
}

export default async function SitePage({ params }: Props) {
  const { teamId, page } = await loadPage(params);
  if (!page) {
    // Redirects from site.json only apply where no page exists.
    const path = `/${((await params).slug ?? []).join("/")}`;
    const settings = await getSettings(teamId);
    const match = settings?.redirects?.find(
      (redirect) => (redirect.from.replace(/\/+$/, "") || "/") === path,
    );
    if (match) (match.permanent === false ? redirect : permanentRedirect)(match.to);
    notFound();
  }

  const canonicalHost = await getCanonicalHost(teamId);
  const [settings, siteTheme] = await Promise.all([
    getSettings(teamId),
    loadSiteTheme(teamId),
  ]);

  return (
    <>
      {page.slug === "" && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: serializeJsonLd(
              organizationAndWebsiteJsonLd({
                siteName: settings?.title || page.title || "Website",
                description: settings?.subtitle || page.description || null,
                logoUrl: (settings?.logo?.url as string | undefined) ?? null,
                canonicalHost,
              }),
            ),
          }}
        />
      )}
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
      />
    </>
  );
}
