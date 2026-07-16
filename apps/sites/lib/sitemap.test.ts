import { describe, expect, it } from "vitest";
import { buildRobotsTxt, buildSitemapXml } from "./sitemap";

describe("buildSitemapXml", () => {
    it("builds absolute URLs on the primary host with lastmod", () => {
        const xml = buildSitemapXml("acme.frontlit.app", [
            { kind: "page", path: "/", lastmod: "2026-01-01T00:00:00.000Z" },
            { kind: "blog", path: "/blog/hello", lastmod: null },
        ]);

        expect(xml).toContain("<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">");
        expect(xml).toContain("<loc>https://acme.frontlit.app/</loc>");
        expect(xml).toContain("<lastmod>2026-01-01T00:00:00.000Z</lastmod>");
        expect(xml).toContain("<loc>https://acme.frontlit.app/blog/hello</loc>");
    });
});

describe("buildRobotsTxt", () => {
    it("disallows /embed/ and points to the primary host's sitemap", () => {
        const txt = buildRobotsTxt("acme.frontlit.app");
        expect(txt).toContain("Disallow: /embed/");
        expect(txt).toContain("Sitemap: https://acme.frontlit.app/sitemap.xml");
    });
});
