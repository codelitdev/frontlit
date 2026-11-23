import { describe, expect, it } from "vitest";
import { buildSitemapXml } from "./sitemap";

describe("buildSitemapXml", () => {
  it("builds absolute URLs on the canonical host with lastmod", () => {
    const xml = buildSitemapXml("acme.frontlit.app", [
      { path: "/", lastmod: "2026-01-01T00:00:00.000Z" },
      { path: "/blog/hello", lastmod: null },
    ]);

    expect(xml).toContain(
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    );
    expect(xml).toContain("<loc>https://acme.frontlit.app/</loc>");
    expect(xml).toContain("<lastmod>2026-01-01T00:00:00.000Z</lastmod>");
    expect(xml).toContain("<loc>https://acme.frontlit.app/blog/hello</loc>");
  });
});
