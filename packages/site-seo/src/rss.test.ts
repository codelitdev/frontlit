import { describe, expect, it } from "vitest";
import { buildRssFeed } from "./rss";

describe("buildRssFeed", () => {
  it("builds a valid RSS 2.0 document with items", () => {
    const xml = buildRssFeed({
      title: "Acme Blog",
      description: "The latest from Acme",
      feedUrl: "https://acme.frontlit.app/blog/rss.xml",
      siteUrl: "https://acme.frontlit.app/blog",
      items: [
        {
          title: "Hello world",
          url: "https://acme.frontlit.app/blog/hello",
          description: "Our first post",
          pubDate: "2026-01-01T00:00:00.000Z",
        },
      ],
    });

    expect(xml).toContain('<rss version="2.0"');
    expect(xml).toContain("<title>Acme Blog</title>");
    expect(xml).toContain("<title>Hello world</title>");
    expect(xml).toContain("<link>https://acme.frontlit.app/blog/hello</link>");
    expect(xml).toContain("<description>Our first post</description>");
  });

  it("escapes XML-significant characters in titles/descriptions", () => {
    const xml = buildRssFeed({
      title: "A & B",
      description: null,
      feedUrl: "https://acme.frontlit.app/blog/rss.xml",
      siteUrl: "https://acme.frontlit.app/blog",
      items: [
        {
          title: "<script>alert(1)</script>",
          url: "https://acme.frontlit.app/blog/x",
          description: null,
          pubDate: null,
        },
      ],
    });

    expect(xml).toContain("<title>A &amp; B</title>");
    expect(xml).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(xml).not.toContain("<script>");
  });

  it("renders an empty item list without items", () => {
    const xml = buildRssFeed({
      title: "Empty",
      description: null,
      feedUrl: "https://x/rss.xml",
      siteUrl: "https://x",
      items: [],
    });
    expect(xml).toContain("<channel>");
    expect(xml).not.toContain("<item>");
  });
});
