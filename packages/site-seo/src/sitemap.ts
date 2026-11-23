/** A public URL for `sitemap.xml`: a site-relative path plus its last
 * change, when known. */
export interface SitemapUrl {
  path: string;
  lastmod?: string | null;
}

/** `<urlset>` body for a site's `sitemap.xml`: every public URL, absolute
 * on the canonical host. */
export function buildSitemapXml(canonicalHost: string, entries: SitemapUrl[]): string {
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
