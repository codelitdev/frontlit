import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TextRenderer } from "../text-renderer";
import { extractDocsHeadings } from "./headings";

describe("DM-CONVERT renderer anchors", () => {
  it("keeps duplicate IDs stable when React replays the mapped element tree", () => {
    const json = {
      type: "doc" as const,
      content: [1, 2].map(() => ({
        type: "heading",
        attrs: { level: 2 },
        content: [{ type: "text", text: "Setup" }],
      })),
    };
    const tree = TextRenderer({ json, profile: "documentation" });
    const first = renderToStaticMarkup(tree);
    expect(renderToStaticMarkup(tree)).toBe(first);
    expect(first).toContain('id="setup-2"');
  });
  it("V29: renders the extractor's duplicate anchors and preserves heading levels", () => {
    const json = {
      type: "doc" as const,
      content: [1, 2, 4, 6].map((level) => ({
        type: "heading",
        attrs: { level },
        content: [{ type: "text", text: "Setup!" }],
      })),
    };
    const html = renderToStaticMarkup(
      React.createElement(TextRenderer, { json, profile: "documentation" }),
    );
    const ids = [...html.matchAll(/id="([^"]+)"/g)].map((match) => match[1]);
    expect(ids).toEqual(extractDocsHeadings(json).map((heading) => heading.id));
    expect(html).toContain('<h4 id="setup-3">');
    expect(html).toContain('<h6 id="setup-4">');
  });
  it("DM-CONVERT: the default profile retains existing heading IDs", () => {
    const json = {
      type: "doc" as const,
      content: [
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "Setup!" }],
        },
      ],
    };
    expect(renderToStaticMarkup(React.createElement(TextRenderer, { json }))).toContain(
      'id="setup!"',
    );
  });

  it("DM-CONVERT: themed level-four headings use the team's header4 typography", () => {
    const json = {
      type: "doc" as const,
      content: [
        {
          type: "heading",
          attrs: { level: 4 },
          content: [{ type: "text", text: "Details" }],
        },
      ],
    };
    const html = renderToStaticMarkup(
      React.createElement(TextRenderer, {
        json,
        profile: "documentation",
        theme: { typography: { header4: { fontFamily: "theme-heading-four" } } },
      }),
    );
    expect(html).toContain('<h4 id="details"');
    expect(html).toContain("theme-heading-four");
  });
});
