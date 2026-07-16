import type { Metadata, ResolvingMetadata } from "next";
import { notFound } from "next/navigation";
import type { Theme } from "@frontlit/page-builder/models";
import { getPageBySlug, getSettings } from "@/lib/api";
import { resolveSeo } from "@/lib/seo";
import { getPrimaryHost } from "@/lib/request-host";
import { organizationAndWebsiteJsonLd, serializeJsonLd } from "@/lib/json-ld";
import { API_PUBLIC_URL } from "@/lib/config";
import { SitePageRenderer } from "@/components/site-page-renderer";

interface Props {
    params: Promise<{ teamId: string; slug?: string[] }>;
}

async function loadPage(params: Props["params"]) {
    const { teamId, slug } = await params;
    const page = await getPageBySlug(teamId, (slug ?? []).join("/"));
    return { teamId, page };
}

export async function generateMetadata({ params }: Props, parent: ResolvingMetadata): Promise<Metadata> {
    const { teamId, page } = await loadPage(params);
    if (!page) return {};

    const [settings, previous] = await Promise.all([getSettings(teamId), parent]);
    const seo = resolveSeo(
        { title: page.title, description: page.description, image: page.socialImage, robotsAllowed: page.robotsAllowed, fallbackName: page.name },
        settings,
        previous.title?.absolute || "FrontLit site",
    );

    return {
        title: page.slug === "" ? seo.title : `${seo.title} | ${previous.title?.absolute}`,
        description: seo.description ?? undefined,
        alternates: { canonical: `https://${await getPrimaryHost()}/${page.slug}` },
        openGraph: { title: seo.title, description: seo.description ?? undefined, images: seo.imageUrl ? [{ url: seo.imageUrl }] : undefined },
        robots: { index: seo.robotsIndex, follow: seo.robotsIndex },
    };
}

export default async function SitePage({ params }: Props) {
    const { teamId, page } = await loadPage(params);
    if (!page) notFound();

    const theme: Theme | null = page.theme ? { id: "custom", name: "Custom", theme: page.theme as any } : null;
    const primaryHost = await getPrimaryHost();

    return (
        <>
            {page.slug === "" && (
                <script
                    type="application/ld+json"
                    // eslint-disable-next-line react/no-danger
                    dangerouslySetInnerHTML={{
                        __html: serializeJsonLd(organizationAndWebsiteJsonLd({ siteName: page.name, logoUrl: null, primaryHost })),
                    }}
                />
            )}
            <SitePageRenderer layout={page.layout} theme={theme} pageData={{ pageType: page.type, teamId, pageSlug: page.slug, publicApiBaseUrl: API_PUBLIC_URL }} />
        </>
    );
}
