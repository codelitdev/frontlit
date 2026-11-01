import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DocsContentError,
  extractDocsHeadings,
  parseDocsMarkdown,
  serializeDocsMarkdown,
  validateDocsContent,
} from "../docs";

const fixture = readFileSync(
  new URL("./fixtures/rich-blocks.md", import.meta.url),
  "utf8",
);
const parse = (markdown: string) =>
  parseDocsMarkdown(markdown, { frontmatter: false }).content;
const diagnostics = (markdown: string) => {
  try {
    parseDocsMarkdown(`---\ntitle: Example\n---\n${markdown}`, { file: "guide.md" });
  } catch (error) {
    expect(error).toBeInstanceOf(DocsContentError);
    return (error as DocsContentError).diagnostics;
  }
  throw new Error("Expected failure");
};

describe("rich docs blocks", () => {
  it("serialize(parse(md)) === md for every block", () => {
    const { content, frontmatter } = parseDocsMarkdown(fixture);
    expect(serializeDocsMarkdown(content, frontmatter)).toBe(fixture);
    expect(content.content?.map((node) => node.type)).toEqual([
      "heading",
      "callout",
      "callout",
      "codeBlock",
      "tabs",
      "steps",
      "cards",
      "accordions",
      "codeGroup",
      "typeTable",
    ]);
  });

  it("maps props onto node attributes", () => {
    const [, plain, callout, code, tabs, , cards, , , table] =
      parseDocsMarkdown(fixture).content.content!;
    expect(plain.attrs).toEqual({ type: null, title: null });
    expect(callout.attrs).toEqual({ type: "warning", title: "Heads up" });
    expect(code.attrs).toEqual({ language: "ts", title: "app/api/route.ts" });
    expect(tabs.content?.map((tab) => tab.attrs?.label)).toEqual([
      "npm",
      'Plain "quoted" tab',
    ]);
    expect(cards.content?.[0].attrs).toEqual({
      title: "Quick start",
      href: "/docs/quick-start",
      icon: "Rocket",
    });
    expect(table.attrs?.rows).toEqual([
      {
        name: "apiKey",
        type: "string",
        default: "MEDIALIT_API_KEY",
        description: "Your app's key.",
        required: false,
      },
      {
        name: "access",
        type: '"public" | "private"',
        default: null,
        description: null,
        required: true,
      },
      {
        name: "data-id",
        type: "number",
        default: null,
        description: null,
        required: false,
      },
    ]);
  });

  it("accepts Fumadocs layouts: indented children, tabs named by items, one-line callouts", () => {
    const content = parse(
      [
        '<Tabs items={["One", "Two"]}>',
        "<Tab>",
        "",
        "First",
        "",
        "</Tab>",
        "<Tab>",
        "",
        "Second",
        "",
        "</Tab>",
        "</Tabs>",
        "",
        "<Cards>",
        '  <Card title="Guide" href="/docs/guide">',
        "    Indented text is a paragraph, not code.",
        "  </Card>",
        "</Cards>",
        "",
        '<Callout type="tip">Short.</Callout>',
      ].join("\n"),
    );
    expect(content.content?.[0].content?.map((tab) => tab.attrs?.label)).toEqual([
      "One",
      "Two",
    ]);
    expect(content.content?.[1].content?.[0].content?.[0].type).toBe("paragraph");
    expect(content.content?.[2]).toEqual({
      type: "callout",
      attrs: { type: "tip", title: null },
      content: [{ type: "paragraph", content: [{ type: "text", text: "Short." }] }],
    });
  });

  it("headings inside blocks get anchors", () => {
    expect(
      extractDocsHeadings(parseDocsMarkdown(fixture).content).map((h) => h.id),
    ).toEqual(["rich-blocks", "install", "configure"]);
  });

  it("keeps plain CommonMark meaning in files without block tags", () => {
    expect(parse("    indented code").content?.[0].type).toBe("codeBlock");
    expect(parse("1 <2 and {braces}").content?.[0].content?.[0]).toEqual({
      type: "text",
      text: "1 <2 and {braces}",
    });
  });

  it.each([
    ["<Widget />", "UNSUPPORTED_NODE", "Unknown component <Widget>"],
    ['<Tab value="x">\n\nText\n\n</Tab>', "UNSUPPORTED_NODE", "must be inside <Tabs>"],
    ["<Steps>\n\nText\n\n</Steps>", "UNSUPPORTED_NODE", "can only contain <Step>"],
    [
      '<Callout type="oops">\n\nText\n\n</Callout>',
      "UNSUPPORTED_ATTRIBUTE",
      "Callout type",
    ],
    [
      '<Callout color="red">\n\nText\n\n</Callout>',
      "UNSUPPORTED_ATTRIBUTE",
      "prop: color",
    ],
    ["<Callout {...props}>\n\nText\n\n</Callout>", "UNSUPPORTED_ATTRIBUTE", "Spread"],
    [
      "<Tabs items={tabs}>\n<Tab>\n\nA\n\n</Tab>\n</Tabs>",
      "UNSUPPORTED_ATTRIBUTE",
      "literal",
    ],
    [
      '<Tabs items={["A"]}>\n<Tab value="B">\n\nA\n\n</Tab>\n</Tabs>',
      "INVALID_DOCUMENT",
      "not listed",
    ],
    [
      "<TypeTable type={{ a: { type: String } }} />",
      "UNSUPPORTED_ATTRIBUTE",
      "literal",
    ],
    [
      '<TypeTable type={{ a: { type: "x", deprecated: true } }} />',
      "UNSUPPORTED_ATTRIBUTE",
      "field a",
    ],
    [
      '<Cards>\n<Card title="X" href="javascript:alert(1)" />\n</Cards>',
      "UNSAFE_URL",
      "unsafe",
    ],
    ["<Callout>\n\nText", "UNSUPPORTED_NODE", "Invalid component syntax"],
    ["Inline <Callout>x</Callout> text", "UNSUPPORTED_NODE", "Inline <Callout>"],
    ['```js title="a" open\n1\n```', "UNSUPPORTED_ATTRIBUTE", "title="],
  ])("rejects %j with a located diagnostic", (markdown, code, message) => {
    const [first] = diagnostics(markdown);
    expect(first).toMatchObject({ code, file: "guide.md" });
    expect(first.message).toContain(message);
    expect(first.line).toBeGreaterThanOrEqual(4);
  });

  it("validates block attributes in editor JSON", () => {
    const doc = (node: unknown) => ({ type: "doc", content: [node] });
    const paragraph = { type: "paragraph", content: [{ type: "text", text: "x" }] };
    expect(
      validateDocsContent(
        doc({ type: "callout", attrs: { type: "loud" }, content: [paragraph] }),
      ).diagnostics[0],
    ).toMatchObject({
      code: "INVALID_DOCUMENT",
      fieldPath: "content.content[0].attrs.type",
    });
    expect(
      validateDocsContent(
        doc({
          type: "tabs",
          content: [{ type: "tab", attrs: { label: 1 }, content: [paragraph] }],
        }),
      ).diagnostics[0],
    ).toMatchObject({ fieldPath: "content.content[0].content[0].attrs.label" });
    expect(
      validateDocsContent(
        doc({
          type: "typeTable",
          attrs: { rows: [{ name: "a", type: "x", extra: 1 }] },
        }),
      ).diagnostics[0],
    ).toMatchObject({ fieldPath: "content.content[0].attrs.rows" });
    expect(
      validateDocsContent(
        doc({ type: "tab", attrs: { label: "x" }, content: [paragraph] }),
      ).diagnostics[0],
    ).toMatchObject({ code: "INVALID_DOCUMENT" });
  });

  it("every state the editor can autosave serializes losslessly", () => {
    const empty = { type: "paragraph" };
    const states = [
      { type: "callout", attrs: { type: "info", title: "" }, content: [empty] },
      {
        type: "tabs",
        content: [
          { type: "tab", attrs: { label: "" }, content: [empty] },
          { type: "tab", attrs: { label: "" }, content: [empty, empty] },
        ],
      },
      {
        type: "steps",
        content: [
          { type: "step", content: [{ type: "heading", attrs: { level: 3 } }, empty] },
        ],
      },
      {
        type: "cards",
        content: [
          { type: "card", attrs: { title: "", href: null, icon: null } },
          {
            type: "card",
            attrs: { title: "With text", href: "/docs/x", icon: null },
            content: [empty],
          },
        ],
      },
      {
        type: "accordions",
        content: [{ type: "accordion", attrs: { title: "" }, content: [empty] }],
      },
      {
        type: "codeGroup",
        content: [
          { type: "codeBlock", attrs: { language: null, title: null } },
          { type: "codeBlock", attrs: { language: null, title: "My file" } },
        ],
      },
      {
        type: "typeTable",
        attrs: {
          // Editor updates may reorder keys; validation canonicalizes them.
          rows: [
            { name: "", type: "", default: null, required: false, description: null },
          ],
        },
      },
    ];
    for (const state of states) {
      const content = { type: "doc", content: [state] };
      expect(validateDocsContent(content).diagnostics).toEqual([]);
      expect(() => serializeDocsMarkdown(content)).not.toThrow();
    }
  });
});
