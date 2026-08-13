import { getSettings, listArticles } from "@/lib/api";
import { buildRssFeed } from "@/lib/rss";
import { getCanonicalHost } from "@/lib/request-host";

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ teamId: string }> },
) {
    const { teamId } = await params;
    const [settings, { items }, canonicalHost] = await Promise.all([
        getSettings(teamId),
        listArticles(teamId, { itemsPerPage: 50 }),
        getCanonicalHost(),
    ]);

    const siteName = settings?.title || "FrontLit site";
    const xml = buildRssFeed({
        title: `${siteName} Blog`,
        description: settings?.subtitle ?? null,
        feedUrl: `https://${canonicalHost}/blog/rss.xml`,
        siteUrl: `https://${canonicalHost}/blog`,
        items: items.map((post) => ({
            title: post.title ?? post.slug,
            url: `https://${canonicalHost}/blog/${post.slug}`,
            description: post.excerpt,
            pubDate: post.publishedAt,
        })),
    });

    return new Response(xml, {
        headers: { "content-type": "application/rss+xml; charset=utf-8" },
    });
}
