import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { blockDefaults } from "./blocks";
import {
  canonicalizeLayout,
  parsePageFile,
  parseSiteFile,
  SchemaValidationError,
  serializePageFile,
  serializeSiteFile,
  type PageDocument,
} from "./files";
import { formatJsonSchema, generateJsonSchemas } from "./json-schema";
import { themeStyleSchema } from "./theme-style";
import { themes } from "../primitives/themes";

function diagnosticsOf(fn: () => unknown) {
  try {
    fn();
  } catch (error) {
    if (error instanceof SchemaValidationError) return error.diagnostics;
    throw error;
  }
  throw new Error("expected a SchemaValidationError");
}

const roundTrip = (page: PageDocument) => {
  const once = serializePageFile(page);
  expect(serializePageFile(parsePageFile(once))).toBe(once);
  return once;
};

describe("page files", () => {
  it("round-trips every block's defaults to a settings-free block", () => {
    const layout = Object.entries(blockDefaults)
      .filter(([name]) => name !== "header" && name !== "footer")
      .map(([name, settings]) => ({ name, settings }));
    const file = JSON.parse(roundTrip({ layout }));
    expect(file.layout).toEqual(layout.map(({ name }) => ({ name })));
  });

  it("writes canonical JSON: schema URL first, defaults omitted, trailing newline", () => {
    const text = roundTrip({
      title: "Pricing",
      robotsAllowed: true,
      published: true,
      layout: [
        {
          name: "hero",
          settings: {
            layout: "normal",
            description: {
              type: "doc",
              content: [
                {
                  type: "paragraph",
                  content: [
                    { type: "text", text: "Simple " },
                    { type: "text", text: "plans", marks: [{ type: "bold" }] },
                    { type: "text", text: "." },
                  ],
                },
              ],
            },
            title: "Pricing that scales",
            media: { mediaId: "m1", file: "https://cdn.test/a.png", caption: "A" },
          },
        },
        { name: "data-slot", settings: { slot: "content-feed", source: "articles" } },
        { name: "header", settings: {} },
      ],
    });
    expect(text).toBe(`{
  "$schema": "https://frontlit.app/schema/page.v1.json",
  "title": "Pricing",
  "layout": [
    {
      "name": "hero",
      "settings": {
        "title": "Pricing that scales",
        "description": "Simple **plans**.",
        "media": {
          "url": "https://cdn.test/a.png",
          "alt": "A"
        }
      }
    },
    {
      "name": "content-feed"
    }
  ]
}
`);
  });

  it("parses Markdown into rich text and assigns list ids by position", () => {
    const page = parsePageFile({
      layout: [
        { name: "rich-text", settings: { text: "Hello *there*" } },
        { name: "faq", settings: { items: [{ question: "Q", answer: "A" }] } },
      ],
    });
    expect(page.layout[0].settings?.text).toMatchObject({ type: "doc" });
    expect(page.layout[1].settings?.items).toEqual([
      { id: "1", question: "Q", answer: "A" },
    ]);
  });

  it("maps content-feed to the FrontLit data slot", () => {
    expect(parsePageFile({ layout: [{ name: "content-feed" }] }).layout).toEqual([
      { name: "data-slot", settings: { slot: "content-feed" } },
    ]);
  });

  it("reports schema errors as JSON pointers", () => {
    const diagnostics = diagnosticsOf(() =>
      parsePageFile({
        layout: [
          { name: "hero", settings: { titel: "typo", layout: "wide" } },
          { name: "nope" },
          { name: "header" },
        ],
      }),
    );
    expect(diagnostics.map((d) => d.path)).toEqual([
      "/layout/0/settings/layout",
      "/layout/0/settings",
      "/layout/1/name",
      "/layout/2/name",
    ]);
  });

  it("reports JSON syntax errors with a line and column", () => {
    const [diagnostic] = diagnosticsOf(() => parsePageFile('{\n  "layout": [,]\n}'));
    expect(diagnostic.line).toBe(2);
    expect(diagnostic.column).toBeGreaterThan(1);
  });

  it("rejects Markdown that rich text can't hold", () => {
    const [diagnostic] = diagnosticsOf(() =>
      parsePageFile({
        layout: [{ name: "rich-text", settings: { text: "<div>html</div>" } }],
      }),
    );
    expect(diagnostic.path).toBe("/layout/0/settings/text");
  });
});

describe("canonicalizeLayout", () => {
  it("strips defaults and normalizes media, keeping widget bookkeeping", () => {
    const [hero] = canonicalizeLayout([
      {
        widgetId: "w1",
        name: "hero",
        deletable: true,
        settings: { ...blockDefaults.hero, media: { file: "https://x.test/a.png" } },
      },
    ]);
    expect(hero).toEqual({
      widgetId: "w1",
      name: "hero",
      deletable: true,
      settings: { media: { url: "https://x.test/a.png" } },
    });
  });

  it("rejects unknown settings with a layout pointer", () => {
    const diagnostics = diagnosticsOf(() =>
      canonicalizeLayout([{ name: "faq", settings: { items: [{ question: "Q" }] } }]),
    );
    expect(diagnostics[0].path).toBe("/layout/0/settings/items/0/answer");
  });
});

describe("site files", () => {
  it("accepts every built-in theme", () => {
    for (const theme of themes) {
      expect(themeStyleSchema.safeParse(theme.theme).success, theme.id).toBe(true);
    }
  });

  it("round-trips theme, chrome and redirects", () => {
    const text = serializeSiteFile({
      theme: themes[0].theme,
      header: { ...blockDefaults.header, ctaLabel: "Sign up" },
      footer: blockDefaults.footer,
      redirects: [{ from: "/old", to: "/new", permanent: true }],
    });
    const parsed = JSON.parse(text);
    expect(parsed.header).toEqual({ ctaLabel: "Sign up" });
    expect(parsed.footer).toBeUndefined();
    expect(parsed.redirects).toEqual([{ from: "/old", to: "/new" }]);
    expect(serializeSiteFile(parseSiteFile(text))).toBe(text);
  });
});

describe("JSON Schemas", () => {
  it("match the committed schema/ files (run `bun run schema:generate`)", () => {
    for (const [file, schema] of Object.entries(generateJsonSchemas())) {
      const committed = readFileSync(
        path.join(__dirname, "../../schema", file),
        "utf8",
      );
      expect(committed, file).toBe(formatJsonSchema(schema));
    }
  });
});
