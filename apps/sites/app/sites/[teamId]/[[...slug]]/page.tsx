import type { Metadata, ResolvingMetadata } from "next";
import { notFound } from "next/navigation";
import { getPageBySlug, getSettings } from "@/lib/api";
import { resolveSeo } from "@/lib/seo";
import { getCanonicalHost, isNoindex } from "@/lib/request-host";
import { organizationAndWebsiteJsonLd, serializeJsonLd } from "@/lib/json-ld";
import { API_PUBLIC_URL } from "@/lib/config";
import { loadSiteTheme } from "@/lib/load-site-theme";
import { SitePageRenderer } from "@/components/site-page-renderer";
import { toSiteBranding } from "@frontlit/api-contract";

interface Props {
  params: Promise<{ teamId: string; slug?: string[] }>;
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
  const isHomepage = page.slug === "";
  const seo = resolveSeo(
    {
      title: page.title,
      description: page.description,
      image: page.socialImage,
      robotsAllowed: page.robotsAllowed,
      // The homepage falls back to the site title, not "Homepage".
      fallbackName: isHomepage ? undefined : page.name,
    },
    settings,
    previous.title?.absolute || "Website",
  );

  const url = `https://${await getCanonicalHost()}/${page.slug}`;
  const index = seo.robotsIndex && !(await isNoindex());
  return {
    // The layout's template appends the site title; the homepage is the
    // site itself, so its title stands alone.
    title: isHomepage ? { absolute: seo.title } : seo.title,
    description: seo.description ?? undefined,
    alternates: { canonical: url },
    openGraph: {
      url,
      title: seo.title,
      description: seo.description ?? undefined,
      images: seo.imageUrl ? [{ url: seo.imageUrl }] : undefined,
    },
    robots: { index, follow: index },
  };
}

export default async function SitePage({ params }: Props) {
  const { teamId, page } = await loadPage(params);
  if (!page) notFound();

  const canonicalHost = await getCanonicalHost();
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
                siteName: page.name,
                logoUrl: null,
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
