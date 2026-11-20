import { describe, expect, it } from "vitest";
import {
  accordion,
  audio,
  callout,
  ContentError,
  defineProfile,
  embed,
  file,
  formatReference,
  getProfileSchema,
  image,
  parseMarkdown,
  pdf,
  serializeMarkdown,
  steps,
  tabs,
  validateContent,
  video,
  type BlockSchema,
} from "./index";

const doc = (...content: unknown[]) => ({ type: "doc", content });
const p = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });
const errors = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(ContentError);
    return (error as ContentError).diagnostics;
  }
  throw new Error("Expected failure");
};

describe("defineProfile", () => {
  it("keeps doc, paragraph and text", () => {
    for (const name of ["doc", "paragraph", "text"])
      expect(() => defineProfile({ base: { exclude: [name] } })).toThrow(
        /can't be excluded/,
      );
  });

  it("throws on unknown names", () => {
    expect(() => defineProfile({ base: { exclude: ["video"] } })).toThrow(
      /unknown base node/,
    );
    expect(() => defineProfile({ base: { marks: { exclude: ["glow"] } } })).toThrow(
      /unknown mark/,
    );
    expect(() => defineProfile({ options: { menu: ["quiz"] } })).toThrow(
      /unknown menu block/,
    );
    expect(() =>
      defineProfile({ base: { headings: { levels: [7 as never] } } }),
    ).toThrow(/heading levels/);
  });

  it("refuses excluding a child without its parent", () => {
    expect(() => defineProfile({ base: { exclude: ["listItem"] } })).toThrow(
      /bulletList/,
    );
    expect(() => defineProfile({ base: { exclude: ["tableCell"] } })).toThrow(/table/);
  });

  it("excluding a parent removes its children from every layer", () => {
    const profile = defineProfile({
      base: { exclude: ["table", "bulletList", "orderedList"] },
    });
    const schema = getProfileSchema(profile);
    for (const name of [
      "table",
      "tableRow",
      "tableCell",
      "tableHeader",
      "listItem",
      "bulletList",
    ]) {
      expect(profile.nodeNames.has(name)).toBe(false);
      expect(schema.nodes[name]).toBeUndefined();
    }
    const one = defineProfile({ base: { exclude: ["orderedList"] } });
    expect(one.nodeNames.has("listItem")).toBe(true);
  });

  it("refuses duplicate blocks and tags", () => {
    expect(() => defineProfile({ blocks: [callout(), callout()] })).toThrow(
      /duplicate/,
    );
  });

  it("accepts BlockUi-shaped entries and keeps their UI", () => {
    const ui = { schema: audio(), insert: { label: "Audio" } };
    const profile = defineProfile({ blocks: [ui] });
    expect(profile.blockSchemas.has("audio")).toBe(true);
    expect(profile.ui.get("audio")).toBe(ui);
  });
});

describe("profile layers", () => {
  const lesson = defineProfile({
    base: {
      exclude: ["table"],
      headings: { levels: [2, 3, 4] },
      marks: { exclude: ["underline"] },
    },
    blocks: [
      image({ hosts: ["images.unsplash.com"], media: true }),
      video(),
      audio(),
      pdf(),
      file(),
      embed(),
      callout(),
    ],
  });

  it("refuses nodes outside the profile with block_not_allowed (JSON and Markdown)", () => {
    const table = doc({
      type: "table",
      content: [
        { type: "tableRow", content: [{ type: "tableHeader", content: [p("a")] }] },
      ],
    });
    expect(validateContent(lesson, table).diagnostics[0]).toMatchObject({
      code: "block_not_allowed",
      fieldPath: "content.content[0].type",
    });
    expect(
      validateContent(lesson, doc({ type: "tabs", content: [] })).diagnostics[0].code,
    ).toBe("block_not_allowed");
    expect(errors(() => parseMarkdown(lesson, "| a |\n| - |\n| b |"))[0]).toMatchObject(
      {
        code: "block_not_allowed",
        line: 1,
      },
    );
    expect(
      errors(() => parseMarkdown(lesson, "<Tabs>\n<Tab>\n\nx\n\n</Tab>\n</Tabs>"))[0]
        .code,
    ).toBe("block_not_allowed");
    expect(errors(() => parseMarkdown(lesson, "# Too high"))[0].code).toBe(
      "block_not_allowed",
    );
    expect(
      validateContent(
        lesson,
        doc({
          type: "heading",
          attrs: { level: 1 },
          content: [{ type: "text", text: "x" }],
        }),
      ).diagnostics[0],
    ).toMatchObject({
      code: "invalid_document",
      fieldPath: "content.content[0].attrs.level",
    });
  });

  it("refuses marks outside the profile", () => {
    const underlined = doc({
      type: "paragraph",
      content: [{ type: "text", text: "x", marks: [{ type: "underline" }] }],
    });
    expect(validateContent(lesson, underlined).diagnostics[0].code).toBe(
      "mark_not_allowed",
    );
    const bare = defineProfile({ base: { marks: { exclude: ["bold"] } } });
    expect(errors(() => parseMarkdown(bare, "**bold**"))[0].code).toBe(
      "mark_not_allowed",
    );
  });

  it("builds a format reference from the blocks' docs and attributes", () => {
    const reference = formatReference(lesson, {
      unavailable: { embed: "plan_required" },
    });
    expect(reference.blocks.map((block) => block.name)).toEqual([
      "image",
      "video",
      "audio",
      "pdf",
      "file",
      "embed",
      "callout",
    ]);
    expect(reference.blocks.find((block) => block.name === "embed")?.unavailable).toBe(
      "plan_required",
    );
    expect(reference.markdown.headingLevels).toEqual([2, 3, 4]);
    expect(reference.markdown.nodes).not.toContain("| GFM | table |");
    const calloutRef = reference.blocks.find((block) => block.name === "callout")!;
    expect(calloutRef.tag).toBe("Callout");
    expect(calloutRef.example).toContain("<Callout");
    expect(calloutRef.attributes.map((attr) => attr.name)).toEqual(["type", "title"]);
    expect(reference.limits).toEqual({ bytes: 1048576, nodes: 20000, depth: 64 });
    expect(JSON.stringify(reference)).not.toContain("Tabs");
  });

  it("library options narrow a block", () => {
    const narrow = defineProfile({ blocks: [callout({ types: ["tip"] })] });
    expect(
      errors(() =>
        parseMarkdown(narrow, '<Callout type="warning">\n\nx\n\n</Callout>'),
      )[0].message,
    ).toContain("Callout type must be one of: tip");
    expect(
      parseMarkdown(narrow, '<Callout type="tip">\n\nx\n\n</Callout>').content?.[0]
        .attrs?.type,
    ).toBe("tip");
    expect(
      errors(() => parseMarkdown(lesson, "![x](https://example.com/a.png)"))[0].code,
    ).toBe("unsafe_url");
    expect(
      parseMarkdown(lesson, "![x](https://images.unsplash.com/a.png)").content?.[0]
        .attrs?.src,
    ).toBe("https://images.unsplash.com/a.png");
  });
});

/** A CourseLit-style block with a nested-tag Markdown form (design doc §4.2). */
const quiz: BlockSchema = {
  name: "quiz",
  tag: "Quiz",
  group: "block",
  attrs: {
    id: {
      default: null,
      validate: (v) => typeof v === "string",
      description: "Quiz ID.",
    },
    passingGrade: {
      default: null,
      validate: (v) =>
        v === null || (Number.isInteger(v) && Number(v) >= 0 && Number(v) <= 100),
      description: "Pass mark.",
    },
    questions: {
      default: [],
      markdown: false,
      validate: Array.isArray,
      description: "Questions.",
    },
  },
  fromMarkdown(element, ctx) {
    const attrs = ctx.attrs(element, quiz);
    const text = (node: any): string =>
      node.type === "text" ? node.value : (node.children ?? []).map(text).join("");
    const named = (node: any, name: string): any[] =>
      (node.children ?? []).flatMap((child: any) =>
        child.name === name ? [child] : named(child, name),
      );
    const questions = named(element, "Question").map((question: any) => ({
      id: ctx.props(question, ["id"]).id,
      text: question.children
        .filter(
          (child: any) => child.type === "paragraph" && !named(child, "Option").length,
        )
        .map(text)
        .join("")
        .trim(),
      options: named(question, "Option").map((option: any) => {
        const o = ctx.props(option, ["id", "correct"]);
        return { id: o.id, text: text(option).trim(), correct: o.correct === true };
      }),
    }));
    return { type: "quiz", attrs: { ...attrs, questions } };
  },
  toMarkdown(node, ctx) {
    const { id, passingGrade, questions } = node.attrs as any;
    return ctx.element(
      "Quiz",
      [ctx.prop("id", id), ctx.prop("passingGrade", passingGrade, true)],
      questions.map((question: any) =>
        ctx.element(
          "Question",
          [ctx.prop("id", question.id)],
          [
            { type: "paragraph", children: [{ type: "text", value: question.text }] },
            ...question.options.map((option: any) =>
              ctx.element(
                "Option",
                [
                  ctx.prop("id", option.id),
                  option.correct
                    ? { type: "mdxJsxAttribute", name: "correct", value: null }
                    : undefined,
                ],
                [
                  {
                    type: "paragraph",
                    children: [{ type: "text", value: option.text }],
                  },
                ],
              ),
            ),
          ],
        ),
      ),
    );
  },
  validate(node, ctx) {
    if ((node.attrs?.questions ?? []).length > 100)
      ctx.report("quiz_limit", "At most 100 questions.", `${ctx.path}.attrs.questions`);
  },
  docs: { summary: "A graded quiz.", example: '<Quiz id="qz_1" />' },
};

describe("host blocks", () => {
  const lesson = defineProfile({ blocks: [quiz] });
  it("supports nested-tag Markdown forms through custom toMarkdown/fromMarkdown", () => {
    const markdown = [
      '<Quiz id="qz_4" passingGrade={70}>',
      '<Question id="q1">',
      "",
      "Which tier anchors the price?",
      "",
      // `option` is a CommonMark HTML block name: a one-line <Option>…</Option> is raw HTML.
      '<Option id="o1" correct>',
      "",
      "The top tier",
      "",
      "</Option>",
      "",
      '<Option id="o2">',
      "",
      "The middle tier",
      "",
      "</Option>",
      "",
      "</Question>",
      "</Quiz>",
    ].join("\n");
    const content = parseMarkdown(lesson, markdown);
    expect(content.content?.[0].attrs).toEqual({
      id: "qz_4",
      passingGrade: 70,
      questions: [
        {
          id: "q1",
          text: "Which tier anchors the price?",
          options: [
            { id: "o1", text: "The top tier", correct: true },
            { id: "o2", text: "The middle tier", correct: false },
          ],
        },
      ],
    });
    const written = serializeMarkdown(lesson, content);
    expect(parseMarkdown(lesson, written)).toEqual(content);
  });

  it("runs block validators with host diagnostic codes", () => {
    const many = Array.from({ length: 101 }, (_, i) => ({
      id: `q${i}`,
      text: "x",
      options: [],
    }));
    const result = validateContent(
      lesson,
      doc({ type: "quiz", attrs: { id: "qz", questions: many } }),
    );
    expect(result.diagnostics[0]).toMatchObject({
      code: "quiz_limit",
      fieldPath: "content.content[0].attrs.questions",
    });
  });
});

describe("library blocks round-trip through Markdown", () => {
  const profile = defineProfile({
    blocks: [
      image({ media: true }),
      video(),
      audio(),
      pdf(),
      file(),
      embed(),
      callout(),
      tabs(),
      accordion(),
      steps(),
    ],
  });
  it.each([
    ["image by URL", '![Team](https://example.com/a.png "Title")\n'],
    ["image by media", '<Image media="med_1" alt="Diagram" />\n'],
    ["video by media", '<Video media="med_2" caption="Walkthrough" />\n'],
    ["youtube video", '<Video url="https://www.youtube.com/watch?v=dQw4w9WgXcQ" />\n'],
    ["vimeo video", '<Video url="https://vimeo.com/76979871" />\n'],
    ["empty video", "<Video />\n"],
    ["audio", '<Audio media="med_3" caption="Episode 1" />\n'],
    ["pdf", '<PDF media="med_4" title="Workbook" />\n'],
    ["file", '<File media="med_5" label="Worksheet" />\n'],
    [
      "embed",
      '<Embed title="Form" height={300}>\n\n```html\n<form>\n  <input name="q">\n</form>\n```\n\n</Embed>\n',
    ],
    ["empty embed", "<Embed />\n"],
    ["callout", '<Callout type="tip" title="Hi">\n\nText.\n\n</Callout>\n'],
    [
      "tabs",
      '<Tabs items={["A", "B"]}>\n\n<Tab value="A">\n\nOne\n\n</Tab>\n\n<Tab value="B">\n\nTwo\n\n</Tab>\n\n</Tabs>\n',
    ],
    [
      "accordion",
      '<Accordions type="single">\n\n<Accordion title="Q">\n\nA\n\n</Accordion>\n\n</Accordions>\n',
    ],
    ["steps", "<Steps>\n\n<Step>\n\n### One\n\nGo.\n\n</Step>\n\n</Steps>\n"],
  ])("%s", (_name, markdown) => {
    const content = parseMarkdown(profile, markdown);
    expect(serializeMarkdown(profile, content)).toBe(markdown);
    expect(validateContent(profile, content).diagnostics).toEqual([]);
  });

  it("reduces a video URL to provider + video ID on write", () => {
    for (const url of [
      "https://youtu.be/dQw4w9WgXcQ?t=42",
      "https://www.youtube.com/embed/dQw4w9WgXcQ",
      "https://m.youtube.com/watch?v=dQw4w9WgXcQ&list=PL1",
      "https://www.youtube.com/shorts/dQw4w9WgXcQ",
    ])
      expect(
        parseMarkdown(profile, `<Video url="${url}" />`).content?.[0].attrs,
      ).toEqual({
        media: null,
        provider: "youtube",
        videoId: "dQw4w9WgXcQ",
        caption: null,
      });
    expect(
      parseMarkdown(profile, '<Video url="https://player.vimeo.com/video/123?h=x" />')
        .content?.[0].attrs,
    ).toMatchObject({
      provider: "vimeo",
      videoId: "123",
    });
    for (const url of [
      "https://evil.com/watch?v=dQw4w9WgXcQ",
      "javascript:alert(1)",
      "https://youtu.be/short",
    ])
      expect(
        errors(() => parseMarkdown(profile, `<Video url="${url}" />`))[0].code,
      ).toBe("unsafe_url");
    expect(
      errors(() =>
        parseMarkdown(
          profile,
          '<Video media="m" url="https://youtu.be/dQw4w9WgXcQ" />',
        ),
      )[0].code,
    ).toBe("invalid_document");
  });

  it("refuses media IDs outside [A-Za-z0-9_-]{1,64}", () => {
    expect(errors(() => parseMarkdown(profile, '<Audio media="../x" />'))[0].code).toBe(
      "unsupported_attribute",
    );
    expect(
      validateContent(profile, doc({ type: "file", attrs: { media: "a".repeat(65) } }))
        .diagnostics[0].code,
    ).toBe("invalid_document");
  });

  it("refuses embeds that aren't one html fence, and oversized code", () => {
    expect(
      errors(() => parseMarkdown(profile, "<Embed>\n\nText\n\n</Embed>"))[0].message,
    ).toContain("html code block");
    const big = defineProfile({ blocks: [embed({ maxBytes: 10 })] });
    expect(
      validateContent(big, doc({ type: "embed", attrs: { code: "<p>too long</p>" } }))
        .diagnostics[0].fieldPath,
    ).toBe("content.content[0].attrs.code");
  });

  it("checks video attributes in JSON", () => {
    const bad = doc({
      type: "video",
      attrs: { provider: "youtube", videoId: 'x" onload="' },
    });
    expect(validateContent(profile, bad).diagnostics[0].code).toBe("unsafe_url");
    const both = doc({
      type: "video",
      attrs: { media: "m", provider: "vimeo", videoId: "1" },
    });
    expect(validateContent(profile, both).diagnostics[0].code).toBe("invalid_document");
  });
});
