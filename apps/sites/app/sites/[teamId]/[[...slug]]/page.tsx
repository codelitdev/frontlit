import type { Metadata, ResolvingMetadata } from "next";
import { notFound } from "next/navigation";
import { getPageBySlug, getSettings } from "@/lib/api";
import { resolveSeo } from "@/lib/seo";
import { getCanonicalHost } from "@/lib/request-host";
import { organizationAndWebsiteJsonLd, serializeJsonLd } from "@/lib/json-ld";
import { API_PUBLIC_URL } from "@/lib/config";
import { loadSiteTheme } from "@/lib/load-site-theme";
import { SitePageRenderer } from "@/components/site-page-renderer";

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

    const [settings, previous] = await Promise.all([
        getSettings(teamId),
        parent,
    ]);
    const seo = resolveSeo(
        {
            title: page.title,
            description: page.description,
            image: page.socialImage,
            robotsAllowed: page.robotsAllowed,
            fallbackName: page.name,
        },
        settings,
        previous.title?.absolute || "FrontLit site",
    );

    return {
        title:
            page.slug === ""
                ? seo.title
                : `${seo.title} | ${previous.title?.absolute}`,
        description: seo.description ?? undefined,
        alternates: {
            canonical: `https://${await getCanonicalHost()}/${page.slug}`,
        },
        openGraph: {
            title: seo.title,
            description: seo.description ?? undefined,
            images: seo.imageUrl ? [{ url: seo.imageUrl }] : undefined,
        },
        robots: { index: seo.robotsIndex, follow: seo.robotsIndex },
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
    const siteLogoUrl =
        typeof settings?.logo?.url === "string" ? settings.logo.url : null;
    const siteLogoAlt =
        typeof settings?.logo?.alt === "string"
            ? settings.logo.alt
            : typeof settings?.logo?.caption === "string"
              ? settings.logo.caption
              : null;

    return (
        <>
            {page.slug === "" && (
                <script
                    type="application/ld+json"
                    // eslint-disable-next-line react/no-danger
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
                siteLogoUrl={siteLogoUrl}
                siteLogoAlt={siteLogoAlt}
                pageData={{
                    pageType: page.type,
                    teamId,
                    pageSlug: page.slug,
                    publicApiBaseUrl: API_PUBLIC_URL,
                }}
            />
        </>
    );
}
