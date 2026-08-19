import type { Metadata, ResolvingMetadata } from "next";
import { notFound } from "next/navigation";
import { getSettings } from "@/lib/api";
import { resolveSeo } from "@/lib/seo";
import { getCanonicalHost } from "@/lib/request-host";
import { API_PUBLIC_URL } from "@/lib/config";
import { SiteChrome } from "@/components/site-chrome";
import { ThemedDocCollection } from "@/components/themed-docs";
import { loadDocsTree } from "@/lib/docs-tree";

interface Props {
    params: Promise<{ teamId: string; sectionSlug: string }>;
}

export async function generateMetadata(
    { params }: Props,
    parent: ResolvingMetadata,
): Promise<Metadata> {
    const { teamId, sectionSlug } = await params;
    const [collections, settings, previous] = await Promise.all([
        loadDocsTree(teamId),
        getSettings(teamId),
        parent,
    ]);
    const collection = collections.find((item) => item.slug === sectionSlug);
    if (!collection) return {};

    const seo = resolveSeo(
        { title: collection.name, fallbackName: collection.name },
        settings,
        previous.title?.absolute || "FrontLit site",
    );

    return {
        title: `${seo.title} | ${previous.title?.absolute}`,
        description: seo.description ?? undefined,
        alternates: {
            canonical: `https://${await getCanonicalHost()}/docs/collections/${sectionSlug}`,
        },
    };
}

export default async function DocCollectionPage({ params }: Props) {
    const { teamId, sectionSlug } = await params;
    const collections = await loadDocsTree(teamId);
    const collection = collections.find((item) => item.slug === sectionSlug);
    if (!collection) notFound();

    return (
        <SiteChrome teamId={teamId}>
            <ThemedDocCollection
                collection={collection}
                teamId={teamId}
                publicApiBaseUrl={API_PUBLIC_URL}
            />
        </SiteChrome>
    );
}
