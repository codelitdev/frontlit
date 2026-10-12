import { describe, expect, it } from "vitest";
import {
  blogPostingJsonLd,
  changelogJsonLd,
  organizationAndWebsiteJsonLd,
  serializeJsonLd,
  techArticleJsonLd,
} from "./json-ld";

describe("json-ld builders", () => {
  it("builds Organization + WebSite for the homepage", () => {
    const [org, site] = organizationAndWebsiteJsonLd({
      siteName: "Acme",
      logoUrl: "https://cdn/logo.png",
      canonicalHost: "acme.frontlit.app",
    });
    expect(org).toMatchObject({
      "@type": "Organization",
      name: "Acme",
      url: "https://acme.frontlit.app",
      logo: "https://cdn/logo.png",
    });
    expect(site).toMatchObject({
      "@type": "WebSite",
      name: "Acme",
      url: "https://acme.frontlit.app",
    });
  });

  it("builds BlogPosting with dateModified falling back to datePublished", () => {
    const ld = blogPostingJsonLd({
      title: "Hello",
      excerpt: "world",
      imageUrl: null,
      publishedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: null,
      authorName: "Ada",
      url: "https://acme.frontlit.app/blog/hello",
    });
    expect(ld.dateModified).toBe("2026-01-01T00:00:00.000Z");
    expect(ld.author).toEqual({ "@type": "Person", name: "Ada" });
  });

  it("builds TechArticle + BreadcrumbList with 1-indexed positions", () => {
    const [article, breadcrumb] = techArticleJsonLd({
      title: "Getting started",
      excerpt: null,
      imageUrl: "https://cdn.example.com/cover.jpg",
      publishedAt: null,
      updatedAt: null,
      url: "https://acme.frontlit.app/docs/getting-started",
      breadcrumb: [
        { name: "Docs", url: "https://acme.frontlit.app/docs" },
        {
          name: "Getting started",
          url: "https://acme.frontlit.app/docs/getting-started",
        },
      ],
    });
    expect(article["@type"]).toBe("TechArticle");
    expect(article.image).toBe("https://cdn.example.com/cover.jpg");
    expect(breadcrumb.itemListElement).toEqual([
      {
        "@type": "ListItem",
        position: 1,
        name: "Docs",
        item: "https://acme.frontlit.app/docs",
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Getting started",
        item: "https://acme.frontlit.app/docs/getting-started",
      },
    ]);
  });

  it("builds a changelog WebPage + ItemList", () => {
    const ld = changelogJsonLd({
      siteName: "Acme",
      url: "https://acme.frontlit.app/changelog",
      entries: [{ name: "v1.0", url: "https://acme.frontlit.app/changelog" }],
    });
    expect(ld.name).toBe("Acme changelog");
    expect((ld.mainEntity as any).itemListElement).toHaveLength(1);
  });

  it("escapes < to prevent script injection from user-authored titles", () => {
    const serialized = serializeJsonLd({
      headline: "</script><script>alert(1)</script>",
    });
    expect(serialized).not.toContain("</script>");
    expect(serialized).not.toContain("<");
    expect(serialized).toContain(
      "\\u003c/script>\\u003cscript>alert(1)\\u003c/script>",
    );
  });
});
