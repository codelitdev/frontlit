import { describe, expect, it } from "vitest";
import { TextEditError } from "@frontlit/text-editor/blocks";
import { blockDefaults } from "./blocks";
import { editPageDocument } from "./edit";
import {
  parsePageFile,
  SchemaValidationError,
  serializePageFile,
  type PageDocument,
} from "./files";

const page: PageDocument = parsePageFile({
  title: "Pricing",
  description: "Plans for every team.",
  layout: [
    {
      name: "hero",
      settings: { title: "Pricing that scales", description: "Simple **plans**." },
    },
    { name: "rich-text", settings: { text: "First line.\n\nSecond line." } },
    { name: "faq", settings: { items: [{ question: "Free trial?", answer: "Yes." }] } },
  ],
});

describe("editPageDocument", () => {
  it("changes only the targeted text, in plain settings, rich text and SEO", () => {
    const before = serializePageFile(page);
    const edited = editPageDocument(page, [
      {
        old_str: '"title": "Pricing that scales"',
        new_str: '"title": "Plans that scale"',
      },
      { old_str: "Second line.", new_str: "Second **line**." },
      {
        old_str: '"description": "Plans for every team."',
        new_str: '"description": "Plans."',
      },
    ]);
    expect(serializePageFile(edited)).toBe(
      before
        .replace('"title": "Pricing that scales"', '"title": "Plans that scale"')
        .replace("Second line.", "Second **line**.")
        .replace('"description": "Plans for every team."', '"description": "Plans."'),
    );
    expect(edited.layout[1].settings?.text).toMatchObject({ type: "doc" });
    expect(edited.layout[2]).toEqual(page.layout[2]);
  });

  it("can add and remove blocks", () => {
    const edited = editPageDocument(page, [
      {
        old_str: '    {\n      "name": "faq",',
        new_str: '    {\n      "name": "banner"\n    },\n    {\n      "name": "faq",',
      },
    ]);
    expect(edited.layout.map((block) => block.name)).toEqual([
      "hero",
      "rich-text",
      "banner",
      "faq",
    ]);
    const removed = editPageDocument(edited, [
      { old_str: '    {\n      "name": "banner"\n    },\n', new_str: "" },
    ]);
    expect(removed.layout.map((block) => block.name)).toEqual([
      "hero",
      "rich-text",
      "faq",
    ]);
  });

  it("refuses an edit that doesn't match, and an invalid result", () => {
    expect(() => editPageDocument(page, [{ old_str: "Nope", new_str: "x" }])).toThrow(
      TextEditError,
    );
    expect(() =>
      editPageDocument(page, [
        { old_str: '"name": "hero"', new_str: '"name": "nonsense"' },
      ]),
    ).toThrow(SchemaValidationError);
    expect(() =>
      editPageDocument(page, [{ old_str: '"title": "Pricing"', new_str: '"title": ' }]),
    ).toThrow(SchemaValidationError);
  });

  it("round-trips every block's defaults through the page file", () => {
    const layout = Object.entries(blockDefaults)
      .filter(([name]) => name !== "header" && name !== "footer")
      .map(([name, settings]) => ({ name, settings }));
    const full = parsePageFile(serializePageFile({ layout }));
    const text = serializePageFile(full);
    expect(serializePageFile(parsePageFile(text))).toBe(text);
  });
});
