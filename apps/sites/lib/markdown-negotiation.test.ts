import { describe, expect, it } from "vitest";
import {
  isNegotiablePath,
  markdownSourcePath,
  markdownUrl,
  prefersMarkdown,
} from "./markdown-negotiation";

describe("prefersMarkdown", () => {
  it("serves Markdown only when asked for at least as strongly as HTML", () => {
    expect(prefersMarkdown("text/markdown")).toBe(true);
    expect(prefersMarkdown("text/markdown, text/html;q=0.9")).toBe(true);
    expect(prefersMarkdown("text/html, text/markdown")).toBe(true);
    expect(prefersMarkdown("text/html, text/markdown;q=0.5")).toBe(false);
    expect(prefersMarkdown("text/markdown;q=0")).toBe(false);
  });

  it("keeps browsers on HTML", () => {
    expect(
      prefersMarkdown(
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,*/*;q=0.8",
      ),
    ).toBe(false);
    expect(prefersMarkdown("*/*")).toBe(false);
    expect(prefersMarkdown(null)).toBe(false);
  });
});

describe("markdown paths", () => {
  it("maps .md URLs to their page", () => {
    expect(markdownSourcePath("/docs/intro.md")).toBe("/docs/intro");
    expect(markdownSourcePath("/index.md")).toBe("/");
    expect(markdownSourcePath("/docs/intro")).toBeNull();
    expect(markdownUrl("/")).toBe("/index.md");
    expect(markdownUrl("/blog/post")).toBe("/blog/post.md");
  });

  it("negotiates pages only", () => {
    expect(isNegotiablePath("/")).toBe(true);
    expect(isNegotiablePath("/docs/intro")).toBe(true);
    expect(isNegotiablePath("/sitemap.xml")).toBe(false);
    expect(isNegotiablePath("/blog/rss.xml")).toBe(false);
    expect(isNegotiablePath("/help/tickets/t_1")).toBe(false);
    expect(isNegotiablePath("/embed/chat")).toBe(false);
  });
});
