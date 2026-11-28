import { readFileSync } from "node:fs";
import type { JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { defaultProfile, docsProfile } from "../profiles";
import { parseDocsMarkdown } from "../docs/markdown";
import { ContentError } from "./diagnostics";
import {
  applyTextEdits,
  editContent,
  fromEditableMarkdown,
  TextEditError,
  toEditableMarkdown,
} from "./edit";
import { parseMarkdown, serializeMarkdown } from "./markdown";
import type { Profile } from "./types";
import { validateContent } from "./validate";

const profiles: [string, Profile][] = [
  ["docs", docsProfile],
  ["default", defaultProfile],
];

const paragraph = (text: string, marks?: JSONContent["marks"]): JSONContent => ({
  type: "paragraph",
  content: [{ type: "text", text, ...(marks ? { marks } : {}) }],
});
const doc = (...content: JSONContent[]): JSONContent => ({ type: "doc", content });
const canonical = (profile: Profile, content: JSONContent) =>
  validateContent(profile, content).content;

/** Converting to editable text and back changes nothing, and converting again prints the same text. */
function expectExactRoundTrip(profile: Profile, content: JSONContent) {
  const text = toEditableMarkdown(profile, content);
  const back = fromEditableMarkdown(profile, text);
  expect(back).toEqual(canonical(profile, content));
  expect(toEditableMarkdown(profile, back)).toBe(text);
  return text;
}

describe("applyTextEdits", () => {
  it("applies edits in order, each to the previous result", () => {
    expect(
      applyTextEdits("one two three", [
        { old_str: "two", new_str: "2" },
        { old_str: "one 2", new_str: "1 and 2" },
      ]),
    ).toBe("1 and 2 three");
  });

  it("deletes with an empty new_str", () => {
    expect(applyTextEdits("keep drop keep", [{ old_str: " drop", new_str: "" }])).toBe(
      "keep keep",
    );
  });

  it("refuses text that is missing or matches more than once, naming the edit", () => {
    const missing = () =>
      applyTextEdits("abc", [
        { old_str: "a", new_str: "A" },
        { old_str: "zzz", new_str: "Z" },
      ]);
    expect(missing).toThrow(TextEditError);
    expect(missing).toThrow(
      expect.objectContaining({ code: "EDIT_NOT_FOUND", index: 1 }),
    );
    expect(() => applyTextEdits("aXa", [{ old_str: "a", new_str: "b" }])).toThrow(
      expect.objectContaining({ code: "EDIT_AMBIGUOUS", index: 0, matches: 2 }),
    );
    // Overlapping occurrences count too.
    expect(() => applyTextEdits("aaa", [{ old_str: "aa", new_str: "b" }])).toThrow(
      expect.objectContaining({ code: "EDIT_AMBIGUOUS" }),
    );
  });

  it("refuses empty, no-op and too many edits", () => {
    expect(() => applyTextEdits("abc", [])).toThrow(
      expect.objectContaining({ code: "EDIT_INVALID" }),
    );
    expect(() => applyTextEdits("abc", [{ old_str: "", new_str: "x" }])).toThrow(
      expect.objectContaining({ code: "EDIT_INVALID", index: 0 }),
    );
    expect(() => applyTextEdits("abc", [{ old_str: "b", new_str: "b" }])).toThrow(
      expect.objectContaining({ code: "EDIT_INVALID" }),
    );
    const many = Array.from({ length: 51 }, () => ({ old_str: "a", new_str: "b" }));
    expect(() => applyTextEdits("a", many)).toThrow(
      expect.objectContaining({ code: "EDIT_INVALID" }),
    );
  });
});

describe("editable Markdown round-trips exactly", () => {
  for (const [name, profile] of profiles) {
    const blocks = [...profile.blockSchemas.values()].filter(
      (schema) => schema.group === "block" && schema.docs.example,
    );

    it(`covers every ${name} block`, () => {
      expect(blocks.length).toBeGreaterThan(5);
    });

    for (const schema of blocks)
      it(`${name}: ${schema.name}`, () => {
        const content = parseMarkdown(profile, schema.docs.example);
        const text = expectExactRoundTrip(profile, content);
        // Markdown-expressible content prints exactly as the plain serializer.
        expect(text).toBe(serializeMarkdown(profile, content));
      });

    it(`${name}: base nodes and marks`, () => {
      const markdown = [
        "# Heading 1",
        "",
        "### Heading 3",
        "",
        "Text with **bold**, *italic*, ~~strike~~, `code` and a [link](https://example.com).\\",
        "After a hard break.",
        "",
        "> A quote",
        "",
        "- one",
        "- two",
        "  - nested",
        "",
        "1. first",
        "2. second",
        "",
        "```ts",
        "const a = 1;",
        "```",
        "",
        "| A | B |",
        "| - | - |",
        "| 1 | 2 |",
        "",
        "***",
        "",
        "![Alt](https://example.com/a.png)",
        "",
      ].join("\n");
      expectExactRoundTrip(profile, parseMarkdown(profile, markdown));
    });
  }

  for (const fixture of ["supported.md", "rich-blocks.md"])
    it(`docs fixture ${fixture}`, () => {
      const source = readFileSync(
        new URL(`../docs/fixtures/${fixture}`, import.meta.url),
        "utf8",
      );
      const { content } = parseDocsMarkdown(source);
      expectExactRoundTrip(docsProfile, content as JSONContent);
    });
});

describe("blocks Markdown can't express", () => {
  const resizedImage: JSONContent = {
    type: "image",
    attrs: { src: "https://example.com/a.png", alt: "Team", width: 300 },
  };
  const mergedTable: JSONContent = {
    type: "table",
    content: [
      {
        type: "tableRow",
        content: [
          {
            type: "tableHeader",
            attrs: { colspan: 2, rowspan: 1 },
            content: [paragraph("Head")],
          },
        ],
      },
      {
        type: "tableRow",
        content: [
          { type: "tableCell", content: [paragraph("a"), paragraph("a2")] },
          { type: "tableCell", content: [paragraph("b")] },
        ],
      },
    ],
  };
  const underlined = paragraph("Underlined", [{ type: "underline" }]);

  it("become raw tiptap blocks that round-trip exactly", () => {
    const content = doc(
      paragraph("Intro."),
      resizedImage,
      paragraph("Middle."),
      mergedTable,
      underlined,
      paragraph("Outro."),
    );
    const text = expectExactRoundTrip(defaultProfile, content);
    expect(text.match(/^```tiptap$/gm)).toHaveLength(3);
    expect(text.startsWith("Intro.\n\n```tiptap\n")).toBe(true);
    expect(text.endsWith("```\n\nOutro.\n")).toBe(true);
  });

  it("leave everything outside an edit unchanged", () => {
    const content = doc(paragraph("Fix the tpyo here."), resizedImage, mergedTable);
    const before = toEditableMarkdown(defaultProfile, content);
    const edited = editContent(defaultProfile, content, [
      { old_str: "tpyo", new_str: "typo" },
    ]);
    expect(toEditableMarkdown(defaultProfile, edited)).toBe(
      before.replace("tpyo", "typo"),
    );
    expect(edited.content?.slice(1)).toEqual(
      canonical(defaultProfile, content)?.content?.slice(1),
    );
  });

  it("can be edited inside their JSON, and the result is validated", () => {
    const content = doc(resizedImage);
    const edited = editContent(defaultProfile, content, [
      { old_str: '"alt":"Team"', new_str: '"alt":"The team"' },
    ]);
    expect(edited.content?.[0].attrs).toMatchObject({ alt: "The team", width: 300 });
    expect(() =>
      editContent(defaultProfile, content, [
        {
          old_str: '"src":"https://example.com/a.png"',
          new_str: '"src":"javascript:alert(1)"',
        },
      ]),
    ).toThrow(ContentError);
  });

  it("reports broken JSON with its line", () => {
    const text = 'First.\n\n```tiptap\n{"type":"image",\n```\n';
    try {
      fromEditableMarkdown(defaultProfile, text);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ContentError);
      expect((error as ContentError).diagnostics[0]).toMatchObject({ line: 4 });
    }
  });

  it("keeps Markdown diagnostics on the right line after a raw block", () => {
    const text = toEditableMarkdown(
      defaultProfile,
      doc(resizedImage, paragraph("End.")),
    );
    const broken = text.replace("End.", "<script>bad()</script>");
    const line = broken.split("\n").indexOf("<script>bad()</script>") + 1;
    try {
      fromEditableMarkdown(defaultProfile, broken);
      expect.unreachable();
    } catch (error) {
      expect((error as ContentError).diagnostics[0]).toMatchObject({ line });
    }
  });

  it("writes a code block labelled tiptap as raw, so it reads back as code", () => {
    const code: JSONContent = {
      type: "codeBlock",
      attrs: { language: "tiptap" },
      content: [{ type: "text", text: "not json" }],
    };
    const text = expectExactRoundTrip(docsProfile, doc(code));
    expect(text.startsWith("```tiptap\n{")).toBe(true);
  });

  it("ignores tiptap fences inside other code", () => {
    const code: JSONContent = {
      type: "codeBlock",
      attrs: { language: "md" },
      content: [{ type: "text", text: '```tiptap\n{"type":"paragraph"}\n```' }],
    };
    expectExactRoundTrip(defaultProfile, doc(code, resizedImage));
  });

  it("refuses a tiptap block whose closing fence was removed", () => {
    const text = toEditableMarkdown(
      defaultProfile,
      doc(resizedImage, paragraph("After.")),
    );
    const broken = text.replace("}\n```\n", "}\n");
    try {
      fromEditableMarkdown(defaultProfile, broken);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ContentError);
      expect((error as ContentError).diagnostics[0]).toMatchObject({ line: 1 });
    }
  });

  it("applies the byte limit to the whole text, not each part", () => {
    const half = "a".repeat(Math.ceil(defaultProfile.limits.bytes / 2));
    const text = toEditableMarkdown(
      defaultProfile,
      doc(paragraph(half), resizedImage, paragraph(half)),
    );
    expect(() => fromEditableMarkdown(defaultProfile, text)).toThrow(ContentError);
  });

  it("an empty document is empty text", () => {
    expect(toEditableMarkdown(defaultProfile, doc())).toBe("");
  });
});
