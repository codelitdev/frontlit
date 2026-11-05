import { describe, expect, it, vi } from "vitest";

vi.mock("./api", () => ({}));
vi.mock("./docs-tree", () => ({}));

const { buildLlmsTxt, notFoundMarkdown, tiptapToMarkdown } = await import("./markdown");

describe("buildLlmsTxt", () => {
  const settings = {
    title: "Acme",
    subtitle: "Widgets for everyone",
    canonicalHost: "acme.com",
    agentInstructions: "Use this site for questions about Acme widgets.",
  } as any;

  it("lists public content as .md links", () => {
    const text = buildLlmsTxt(
      settings,
      [
        { kind: "page", path: "/", title: "Home", lastmod: null },
        { kind: "doc", path: "/docs/intro", title: "Intro", lastmod: null },
        { kind: "blog", path: "/blog/hello", title: "Hello", lastmod: null },
        { kind: "changelog", path: "/changelog", title: "Changelog", lastmod: null },
      ],
      true,
    );
    expect(text).toBe(`# Acme

> Widgets for everyone

## Agent instructions

Use this site for questions about Acme widgets.

## Pages

- [Home](https://acme.com/index.md)

## Docs

- [Intro](https://acme.com/docs/intro.md)

## Blog

- [Hello](https://acme.com/blog/hello.md)

## Changelog

- [Changelog](https://acme.com/changelog.md)

## API

- [OpenAPI spec](https://acme.com/openapi.json)
`);
  });

  it("lists a path once when a builder page sits on the changelog", () => {
    const text = buildLlmsTxt(
      settings,
      [
        { kind: "page", path: "/changelog", title: "Changelog", lastmod: null },
        { kind: "changelog", path: "/changelog", title: "Changelog", lastmod: null },
      ],
      false,
    );
    expect(text.match(/changelog\.md/g)).toHaveLength(1);
    expect(text).not.toContain("## Changelog");
  });

  it("omits empty sections", () => {
    expect(buildLlmsTxt({ ...settings, agentInstructions: null }, [], false)).toBe(
      "# Acme\n\n> Widgets for everyone\n",
    );
  });
});

describe("markdown bodies", () => {
  it("links a missing page to the site indexes", () => {
    const body = notFoundMarkdown("/nope");
    expect(body).toContain("/llms.txt");
    expect(body).toContain("/sitemap.xml");
    expect(body.length).toBeGreaterThan(20);
  });

  it("serializes TipTap content", () => {
    expect(
      tiptapToMarkdown({
        type: "doc",
        content: [
          {
            type: "heading",
            attrs: { level: 2 },
            content: [{ type: "text", text: "Setup" }],
          },
          { type: "paragraph", content: [{ type: "text", text: "Install it." }] },
        ],
      }),
    ).toBe("## Setup\n\nInstall it.");
  });
});
