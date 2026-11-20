import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  DocsContentError,
  parseDocsMarkdown,
  serializeDocsMarkdown,
  validateDocsContent,
} from "../docs";
import { isAllowedHostUrl } from "../core/library";
import { TextRenderer } from "../text-renderer";
import type { TextEditorContent } from "../text-editor-content";

const parse = (markdown: string) =>
  parseDocsMarkdown(markdown, { frontmatter: false }).content;
const roundTrip = (markdown: string) => serializeDocsMarkdown(parse(markdown));
const errors = (markdown: string) => {
  try {
    parse(markdown);
  } catch (error) {
    expect(error).toBeInstanceOf(DocsContentError);
    return (error as DocsContentError).diagnostics.map((d) => d.code);
  }
  throw new Error("Expected failure");
};

describe("Button, WebPreview and H5P", () => {
  it("parse and serialize as one-line tags", () => {
    for (const markdown of [
      '<Button label="Start the course" href="/courses/intro" />\n',
      '<Button label="Read more" href="https://example.com/guide" variant="secondary" />\n',
      '<WebPreview url="https://example.com/guide" title="The guide" description="Everything in one place." image="https://example.com/cover.png" />\n',
      '<H5P src="https://h5p.org/h5p/embed/712" title="Drag the words" height={600} />\n',
      '<H5P src="https://acme.h5p.com/content/1291/embed" />\n',
      '<Callout type="success">\n\nShipped.\n\n</Callout>\n',
    ])
      expect(roundTrip(markdown)).toBe(markdown);
  });

  it("refuses unsafe links, non-H5P hosts and unknown variants", () => {
    expect(errors('<Button label="Go" href="javascript:alert(1)" />')).toContain(
      "UNSAFE_URL",
    );
    expect(errors('<WebPreview url="/relative/page" />')).toContain("UNSAFE_URL");
    expect(
      errors('<WebPreview url="https://a.com" image="http://a.com/x.png" />'),
    ).toContain("UNSAFE_URL");
    expect(errors('<H5P src="https://evil.example/h5p/embed/1" />')).toContain(
      "UNSAFE_URL",
    );
    expect(errors('<Button label="Go" href="/x" variant="huge" />').length).toBe(1);
  });

  it("accepts blocks still being filled in (autosave)", () => {
    const content = {
      type: "doc",
      content: [
        { type: "button", attrs: { label: "", href: null } },
        { type: "webPreview", attrs: { url: null } },
        { type: "h5p", attrs: { src: null } },
      ],
    };
    expect(validateDocsContent(content as never).diagnostics).toEqual([]);
  });

  it("renders links safely and draws nothing without a URL", () => {
    const html = renderToStaticMarkup(
      React.createElement(TextRenderer, {
        profile: "documentation" as const,
        json: parse(
          [
            '<Button label="Docs" href="https://example.com/docs" />',
            '<WebPreview url="https://www.example.com/a" description="About" />',
            '<H5P src="https://h5p.org/h5p/embed/712" />',
            '<Button label="No link" />',
          ].join("\n\n"),
        ) as TextEditorContent,
      }),
    );
    expect(html).toContain(
      '<a class="te-button" href="https://example.com/docs" data-variant="primary" target="_blank" rel="noopener noreferrer">Docs</a>',
    );
    expect(html).toContain('<span class="te-web-preview__title">example.com</span>');
    expect(html).toContain('src="https://h5p.org/h5p/embed/712"');
    expect(html).toContain('title="H5P activity"');
    expect(html).not.toContain("No link");
  });

  it("matches H5P hosts exactly or by subdomain wildcard", () => {
    const hosts = ["h5p.org", "*.h5p.com"];
    expect(isAllowedHostUrl("https://h5p.org/x", hosts)).toBe(true);
    expect(isAllowedHostUrl("https://acme.h5p.com/x", hosts)).toBe(true);
    expect(isAllowedHostUrl("https://h5p.com.evil.io/x", hosts)).toBe(false);
    expect(isAllowedHostUrl("https://evilh5p.com/x", hosts)).toBe(false);
    expect(isAllowedHostUrl("http://h5p.org/x", hosts)).toBe(false);
  });
});
