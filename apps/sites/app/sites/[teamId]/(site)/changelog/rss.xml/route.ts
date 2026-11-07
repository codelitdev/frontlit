import { changelogDate, publicContentPath } from "@frontlit/api-contract";
import { getCanonicalHost, getSettings, listProductUpdates } from "@/lib/api";
import { plainTextSummary } from "@/lib/markdown";
import { buildRssFeed } from "@/lib/rss";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ teamId: string }> },
) {
  const { teamId } = await params;
  const [settings, { items }, canonicalHost] = await Promise.all([
    getSettings(teamId),
    listProductUpdates(teamId, { itemsPerPage: 50 }),
    getCanonicalHost(teamId),
  ]);

  const siteName = settings?.title || "Website";
  const xml = buildRssFeed({
    title: `${siteName} Changelog`,
    description: settings?.subtitle ?? null,
    feedUrl: `https://${canonicalHost}/changelog/rss.xml`,
    siteUrl: `https://${canonicalHost}/changelog`,
    items: items.map((entry) => ({
      title: entry.title ?? entry.slug,
      // Each entry is an anchor on /changelog; the URL doubles as its guid.
      url: `https://${canonicalHost}${publicContentPath("changelog", entry.slug)}`,
      description: entry.excerpt || plainTextSummary(entry.content) || null,
      pubDate: changelogDate(entry),
    })),
  });

  return new Response(xml, {
    headers: { "content-type": "application/rss+xml; charset=utf-8" },
  });
}
