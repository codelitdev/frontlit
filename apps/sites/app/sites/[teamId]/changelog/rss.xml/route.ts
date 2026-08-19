import { getSettings, listProductUpdates } from "@/lib/api";
import { buildRssFeed } from "@/lib/rss";
import { getCanonicalHost } from "@/lib/request-host";

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ teamId: string }> },
) {
    const { teamId } = await params;
    const [settings, { items }, canonicalHost] = await Promise.all([
        getSettings(teamId),
        listProductUpdates(teamId, { itemsPerPage: 50 }),
        getCanonicalHost(),
    ]);

    const siteName = settings?.title || "FrontLit site";
    const xml = buildRssFeed({
        title: `${siteName} Changelog`,
        description: settings?.subtitle ?? null,
        feedUrl: `https://${canonicalHost}/changelog/rss.xml`,
        siteUrl: `https://${canonicalHost}/changelog`,
        items: items.map((entry) => ({
            title: entry.title ?? entry.slug,
            url: `https://${canonicalHost}/changelog`,
            description: entry.excerpt,
            pubDate: entry.publishedAt,
        })),
    });

    return new Response(xml, {
        headers: { "content-type": "application/rss+xml; charset=utf-8" },
    });
}
