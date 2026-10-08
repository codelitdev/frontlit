import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  createDocsExtensions,
  docsSchema,
  DocsContentError,
  extractDocsHeadings,
  parseDocsMarkdown,
  requireDocsContent,
  serializeDocsMarkdown,
  validateDocsContent,
} from "../docs";

const doc = (...content: unknown[]) => ({ type: "doc", content });
const text = (value: string) => ({ type: "text", text: value });
const paragraph = (...content: unknown[]) => ({ type: "paragraph", content });
const fixture = readFileSync(
  new URL("./fixtures/supported.md", import.meta.url),
  "utf8",
);
const diagnostics = (fn: () => unknown) => {
  try {
    fn();
    throw new Error("Expected failure");
  } catch (error) {
    expect(error).toBeInstanceOf(DocsContentError);
    return (error as DocsContentError).diagnostics;
  }
};

describe("DM-VALIDATE / DM-CONVERT headless profile", () => {
  it("V29: runs without browser globals and uses the same schema as its extensions", () => {
    expect(typeof window).toBe("undefined");
    expect(typeof document).toBe("undefined");
    expect(createDocsExtensions().some((extension) => extension.name === "image")).toBe(
      true,
    );
    expect(docsSchema.nodes.codeMirror).toBeUndefined();
    expect(docsSchema.marks.underline).toBeUndefined();
    expect(requireDocsContent({ type: "doc" })).toEqual(doc());
  });

  it("V29: Markdown → JSON → Markdown preserves every supported construct and unknown metadata", () => {
    const first = parseDocsMarkdown(fixture);
    const exported = serializeDocsMarkdown(first.content, first.frontmatter);
    const second = parseDocsMarkdown(exported);
    expect(second).toEqual(first);
    expect(second.frontmatter?.custom).toEqual({
      product: "FrontLit",
      flags: ["one", "two"],
    });
    expect(extractDocsHeadings(first.content).map((heading) => heading.id)).toEqual([
      "documentation-fixtures",
      "setup",
      "setup-2",
    ]);
    expect(exported).toContain("<Widget value={1} />");
    expect(first.content.content?.[0].type).toBe("heading"); // body H1 is retained
  });

  it("V29: JSON → Markdown → JSON handles adjacent and overlapping mark runs", () => {
    const input = requireDocsContent(
      doc(
        paragraph(
          { ...text("one "), marks: [{ type: "bold" }] },
          { ...text("two"), marks: [{ type: "bold" }, { type: "italic" }] },
          { ...text(" three"), marks: [{ type: "bold" }] },
        ),
      ),
    );
    expect(
      parseDocsMarkdown(serializeDocsMarkdown(input), { frontmatter: false }).content,
    ).toEqual(input);
  });

  it.each([
    [
      doc({ type: "heading", attrs: { level: 7 }, content: [text("bad")] }),
      "content.content[0].attrs.level",
      "INVALID_DOCUMENT",
    ],
    [
      doc(paragraph({ type: "codeMirror", content: [] })),
      "content.content[0].content[0].type",
      "UNSUPPORTED_NODE",
    ],
    [
      doc(paragraph({ ...text("bad"), marks: [{ type: "highlight" }] })),
      "content.content[0].content[0].marks[0].type",
      "UNSUPPORTED_MARK",
    ],
    [
      doc(paragraph({ ...text("bad"), attrs: { surprise: true } })),
      "content.content[0].content[0].attrs.surprise",
      "UNSUPPORTED_ATTRIBUTE",
    ],
    [doc(paragraph({ type: "paragraph" })), "content.content[0]", "INVALID_DOCUMENT"],
    [
      doc({ type: "listItem", content: [text("wrong child")] }),
      "content.content[0]",
      "INVALID_DOCUMENT",
    ],
    [
      doc(
        paragraph({
          ...text("unsafe"),
          marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
        }),
      ),
      "content.content[0].content[0].marks[0].attrs.href",
      "UNSAFE_URL",
    ],
    [
      doc({ type: "image", attrs: { src: "data:image/png;base64,YQ==" } }),
      "content.content[0].attrs.src",
      "UNSAFE_URL",
    ],
  ])("V02: rejects malformed trees with exact paths", (input, fieldPath, code) => {
    expect(validateDocsContent(input).diagnostics).toContainEqual(
      expect.objectContaining({ code, fieldPath, blocksSave: true }),
    );
  });

  it.each([
    ["import Widget from './widget'", "UNSUPPORTED_NODE"],
    ["export const value = 1", "UNSUPPORTED_NODE"],
    ["<Widget enabled />", "UNSUPPORTED_NODE"],
    ["<script>alert(1)</script>", "UNSUPPORTED_NODE"],
    ["[unsafe](javascript:alert)", "UNSAFE_URL"],
    ["![inline](data:image/png;base64,YQ==)", "UNSAFE_URL"],
    ["![local](images/screenshot.png)", "UNMANAGED_BINARY"],
    ["- [x] task", "UNSUPPORTED_NODE"],
    ["[^one]\n\n[^one]: footnote", "UNSUPPORTED_NODE"],
    ["```js title=demo\n1\n```", "UNSUPPORTED_ATTRIBUTE"],
    ["| Aligned |\n| :--- |\n| value |", "UNSUPPORTED_ATTRIBUTE"],
  ])("V29: rejects unsupported Markdown with original file locations", (body, code) => {
    const errors = diagnostics(() =>
      parseDocsMarkdown(`---\ntitle: Example\n---\n${body}`, {
        file: "manual/example.md",
      }),
    );
    expect(errors[0]).toMatchObject({
      code,
      file: "manual/example.md",
      line: 4,
      column: 1,
    });
  });

  it.each([
    "title: One\ntitle: Two",
    "title: !execute bad",
    "title: One\ncustom: &ref x\nother: *ref",
    "title: One\n__proto__: bad",
    "title: One\nnav_order: 1.5",
    "title: One\npublished: yes",
    "description: missing title",
  ])("DM-SOURCE: rejects unsafe or malformed YAML", (yaml) => {
    expect(
      diagnostics(() => parseDocsMarkdown(`---\n${yaml}\n---\nSafe`))[0].code,
    ).toBe("INVALID_FRONTMATTER");
  });

  it("V29: rejects merged/multiblock/ragged tables", () => {
    const first = parseDocsMarkdown("| A | B |\n| --- | --- |\n| 1 | 2 |", {
      frontmatter: false,
    }).content;
    const merged = structuredClone(first);
    merged.content![0].content![0].content![0].attrs!.colspan = 2;
    expect(validateDocsContent(merged).diagnostics[0].code).toBe("INVALID_DOCUMENT");
    const multi = structuredClone(first);
    multi.content![0].content![0].content![0].content!.push({ type: "paragraph" });
    expect(
      validateDocsContent(multi).diagnostics.some((d) => d.code === "INVALID_DOCUMENT"),
    ).toBe(true);
    const ragged = structuredClone(first);
    ragged.content![0].content![1].content!.pop();
    expect(
      validateDocsContent(ragged).diagnostics.some((d) =>
        d.message.includes("rectangular"),
      ),
    ).toBe(true);
  });

  it("DM-VALIDATE: rejects supplied invalid content instead of defaulting to empty", () => {
    for (const input of [null, {}, { type: "doc", content: "wrong" }, doc(text(""))])
      expect(validateDocsContent(input).content).toBeUndefined();
  });

  it("DM-CONVERT: empty editor paragraphs are nonsemantic spacing in Markdown", () => {
    expect(serializeDocsMarkdown(doc(paragraph()))).toBe("");
    expect(
      parseDocsMarkdown(
        serializeDocsMarkdown(doc(paragraph(), paragraph(text("Hello")), paragraph())),
        { frontmatter: false },
      ).content,
    ).toEqual(requireDocsContent(doc(paragraph(text("Hello")))));
  });

  it("DM-CONVERT/V29: missing image alt and empty list items have supported representations", () => {
    const image = requireDocsContent(
      doc({ type: "image", attrs: { src: "https://example.com/image.png" } }),
    );
    expect(
      parseDocsMarkdown(serializeDocsMarkdown(image), { frontmatter: false }).content,
    ).toEqual(image);
    const list = requireDocsContent(
      doc({
        type: "bulletList",
        content: [{ type: "listItem", content: [paragraph()] }],
      }),
    );
    expect(
      parseDocsMarkdown(serializeDocsMarkdown(list), { frontmatter: false }).content,
    ).toEqual(list);
  });

  it("DM-CONVERT/V29: retains safe escaped syntax and trailing whitespace", () => {
    const first = parseDocsMarkdown(
      "Literal \\<Widget> and braces {example}.  \nNext.\n",
      { frontmatter: false },
    );
    expect(
      parseDocsMarkdown(serializeDocsMarkdown(first.content), { frontmatter: false }),
    ).toEqual(first);
  });

  it("DM-VALIDATE: prototype-sensitive fields cannot bypass attribute allowlists", () => {
    const input = JSON.parse(
      '{"type":"doc","content":[{"type":"heading","attrs":{"level":2,"constructor":"bad","__proto__":{}},"content":[{"type":"text","text":"Safe"}]}]}',
    );
    const errors = validateDocsContent(input).diagnostics;
    expect(errors).toContainEqual(
      expect.objectContaining({
        code: "UNSUPPORTED_ATTRIBUTE",
        fieldPath: "content.content[0].attrs.constructor",
      }),
    );
    expect(errors).toContainEqual(
      expect.objectContaining({
        code: "UNSUPPORTED_ATTRIBUTE",
        fieldPath: "content.content[0].attrs.__proto__",
      }),
    );
  });
});
