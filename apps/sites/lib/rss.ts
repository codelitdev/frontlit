function escapeXml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

export interface RssItem {
    title: string;
    url: string;
    /** Plain-text summary (an entry's `excerpt`), emitted as
     * `<description>`. Full-body rendering is skipped: a Route Handler
     * can't import React's server renderer, and the TipTap JSON body has
     * no paragraph structure once flattened to plain text anyway. */
    description: string | null;
    pubDate: string | null;
}

/** RSS 2.0 feed for `/blog/rss.xml` and `/changelog/rss.xml` (architecture.md
 * §12.3), capped at the 50 newest by the caller. */
export function buildRssFeed(input: {
    title: string;
    description: string | null;
    feedUrl: string;
    siteUrl: string;
    items: RssItem[];
}): string {
    const itemsXml = input.items
        .map(
            (item) => `    <item>
      <title>${escapeXml(item.title)}</title>
      <link>${escapeXml(item.url)}</link>
      <guid>${escapeXml(item.url)}</guid>
      ${item.pubDate ? `<pubDate>${new Date(item.pubDate).toUTCString()}</pubDate>` : ""}
      ${item.description ? `<description>${escapeXml(item.description)}</description>` : ""}
    </item>`,
        )
        .join("\n");

    return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escapeXml(input.title)}</title>
    <link>${escapeXml(input.siteUrl)}</link>
    ${input.description ? `<description>${escapeXml(input.description)}</description>` : ""}
    <atom:link href="${escapeXml(input.feedUrl)}" rel="self" type="application/rss+xml" xmlns:atom="http://www.w3.org/2005/Atom" />
${itemsXml}
  </channel>
</rss>
`;
}
