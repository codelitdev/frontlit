import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { isExternalUrl, linkAttributes } from "../core/urls";
import { validateContent } from "../core/validate";
import { resolveProfile } from "../profiles";
import { TextRenderer } from "../text-renderer";
import { parseDocsMarkdown } from "./markdown";

const SITE = "docs.example.com";
const MARKDOWN = [
  "[relative](/docs/self-hosting/sending-safeguards)",
  "[anchor](#setup)",
  `[own](https://${SITE}/docs/intro)`,
  "[other](https://github.com/codelitdev/frontlit)",
].join(" ");

/** Articles, changelog entries and docs all parse Markdown with this. */
const parse = (markdown: string) =>
  parseDocsMarkdown(markdown, { frontmatter: false }).content;

const linkMarks = (json: unknown) =>
  JSON.stringify(json)
    .match(/\{"type":"link","attrs":\{[^}]*\}\}/g)
    ?.map((mark) => JSON.parse(mark).attrs) ?? [];

const anchors = (html: string) =>
  [...html.matchAll(/<a [^>]*>/g)].map(([tag]) => ({
    href: /href="([^"]*)"/.exec(tag)?.[1],
    target: /target="([^"]*)"/.exec(tag)?.[1] ?? null,
    rel: /rel="([^"]*)"/.exec(tag)?.[1] ?? null,
  }));

const paragraph = (...links: Array<{ href: string; extra?: object }>) => ({
  type: "doc" as const,
  content: [
    {
      type: "paragraph",
      content: links.map(({ href, extra }) => ({
        type: "text",
        text: href,
        marks: [{ type: "link", attrs: { href, ...extra } }],
      })),
    },
  ],
});

describe("Markdown links", () => {
  it("are stored without target or rel, internal and external alike", () => {
    const marks = linkMarks(parse(MARKDOWN));
    expect(marks).toHaveLength(4);
    for (const attrs of marks) {
      expect(attrs.target).toBeNull();
      expect(attrs.rel).toBeNull();
    }
  });

  it("stay valid and attribute-free through validation, for both profiles", () => {
    for (const name of ["default", "documentation"] as const) {
      const { content, diagnostics } = validateContent(
        resolveProfile(name),
        parse(MARKDOWN),
      );
      expect(diagnostics).toEqual([]);
      for (const attrs of linkMarks(content)) {
        expect(attrs.target).toBeNull();
        expect(attrs.rel).toBeNull();
      }
    }
  });

  it("stored with Tiptap's old target/rel defaults still validate", () => {
    const legacy = paragraph({
      href: "/docs/x",
      extra: { target: "_blank", rel: "noopener noreferrer nofollow" },
    });
    expect(validateContent(resolveProfile("default"), legacy).diagnostics).toEqual([]);
  });
});

describe("rendered links", () => {
  const render = (json: unknown, profile: "default" | "documentation") =>
    anchors(
      renderToStaticMarkup(
        React.createElement(TextRenderer, {
          json: json as never,
          profile,
          siteHosts: [SITE],
        }),
      ),
    );

  for (const profile of ["default", "documentation"] as const) {
    it(`open only external links in a new tab, never nofollow (${profile})`, () => {
      expect(render(parse(MARKDOWN), profile)).toEqual([
        { href: "/docs/self-hosting/sending-safeguards", target: null, rel: null },
        { href: "#setup", target: null, rel: null },
        { href: `https://${SITE}/docs/intro`, target: null, rel: null },
        {
          href: "https://github.com/codelitdev/frontlit",
          target: "_blank",
          rel: "noopener noreferrer",
        },
      ]);
    });
  }

  it("ignore target/rel stored by the old Tiptap defaults", () => {
    const old = { target: "_blank", rel: "noopener noreferrer nofollow" };
    const json = paragraph(
      { href: "/docs/self-hosting/sending-safeguards", extra: old },
      { href: `https://www.${SITE}/pricing`, extra: old },
      { href: "https://example.org/", extra: old },
    );
    expect(render(json, "default")).toEqual([
      { href: "/docs/self-hosting/sending-safeguards", target: null, rel: null },
      { href: `https://www.${SITE}/pricing`, target: null, rel: null },
      { href: "https://example.org/", target: "_blank", rel: "noopener noreferrer" },
    ]);
  });

  it("apply the same rule to Button blocks", () => {
    const json = parse(
      [
        `<Button label="Start" href="https://${SITE}/start" />`,
        "",
        '<Button label="Out" href="https://example.org/" />',
      ].join("\n"),
    );
    expect(render(json, "documentation")).toEqual([
      { href: `https://${SITE}/start`, target: null, rel: null },
      { href: "https://example.org/", target: "_blank", rel: "noopener noreferrer" },
    ]);
  });
});

describe("isExternalUrl / linkAttributes", () => {
  it("treat relative, fragment, mailto and own-host links as internal", () => {
    for (const href of ["/a", "a/b", "#x", "?q=1", "mailto:a@b.co"])
      expect(isExternalUrl(href, [SITE])).toBe(false);
    expect(isExternalUrl(`https://${SITE.toUpperCase()}/a`, [SITE])).toBe(false);
    expect(isExternalUrl("http://localhost:3001/a", ["localhost:3001"])).toBe(false);
  });

  it("treat other hosts, including subdomains of the site, as external", () => {
    expect(isExternalUrl("https://example.org", [SITE])).toBe(true);
    expect(isExternalUrl(`https://evil.${SITE}`, [SITE])).toBe(true);
    expect(isExternalUrl(`https://${SITE}.evil.com`, [SITE])).toBe(true);
    expect(linkAttributes("https://example.org")).toEqual({
      target: "_blank",
      rel: "noopener noreferrer",
    });
    expect(linkAttributes("/docs")).toEqual({});
  });
});
