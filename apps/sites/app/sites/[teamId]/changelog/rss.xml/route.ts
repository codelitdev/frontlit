import { getSettings, listChangelogs } from "@/lib/api";
import { buildRssFeed } from "@/lib/rss";
import { getPrimaryHost } from "@/lib/request-host";

export async function GET(_request: Request, { params }: { params: Promise<{ teamId: string }> }) {
    const { teamId } = await params;
    const [settings, { items }, primaryHost] = await Promise.all([getSettings(teamId), listChangelogs(teamId, { itemsPerPage: 50 }), getPrimaryHost()]);

    const siteName = settings?.title || "FrontLit site";
    const xml = buildRssFeed({
        title: `${siteName} Changelog`,
        description: settings?.subtitle ?? null,
        feedUrl: `https://${primaryHost}/changelog/rss.xml`,
        siteUrl: `https://${primaryHost}/changelog`,
        items: items.map((entry) => ({
            title: entry.title ?? entry.slug,
            url: `https://${primaryHost}/changelog`,
            description: entry.excerpt,
            pubDate: entry.publishedAt,
        })),
    });

    return new Response(xml, { headers: { "content-type": "application/rss+xml; charset=utf-8" } });
}
