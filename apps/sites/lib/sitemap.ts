import type { SitemapEntry } from "./api";

/** `<urlset>` body for `sitemap.xml/route.ts` — every published,
 * robots-allowed URL, absolute on the canonical host (architecture.md §12.3).
 * Fully derived from the API's sitemap read; nothing authored here. */
export function buildSitemapXml(canonicalHost: string, entries: SitemapEntry[]): string {
    const urls = entries
        .map((entry) => {
            const loc = `https://${canonicalHost}${entry.path}`;
            return `  <url>
    <loc>${loc}</loc>
    ${entry.lastmod ? `<lastmod>${entry.lastmod}</lastmod>` : ""}
  </url>`;
        })
        .join("\n");

    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

/** Per-host robots policy (architecture.md §12.3) — the embed iframe is
 * disallowed since it's an isolated widget surface, not a content page. */
export function buildRobotsTxt(canonicalHost: string): string {
    return `User-agent: *
Allow: /
Disallow: /embed/
Sitemap: https://${canonicalHost}/sitemap.xml
`;
}
