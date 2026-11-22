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
import { toPageText } from "./rich-text";
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

  it("keeps rich text to basic formatting", () => {
    const text = (value: string) =>
      parsePageFile({ layout: [{ name: "rich-text", settings: { text: value } }] })
        .layout[0].settings!.text;
    expect(
      text(
        "## Plans\n\n- **One**\n\n> Quote\n\n```ts\nconst a = 1;\n```\n\n---\n\n[x](/a)",
      ),
    ).toMatchObject({ type: "doc" });
    for (const markdown of [
      "# Title",
      "| a |\n| - |\n| b |",
      "![alt](https://x.test/a.png)",
      '<Callout type="info">\n\nHi\n\n</Callout>',
      '<Tabs>\n<Tab title="A">\n\nA\n\n</Tab>\n</Tabs>',
    ]) {
      const [diagnostic] = diagnosticsOf(() => text(markdown));
      expect(diagnostic.path, markdown).toBe("/layout/0/settings/text");
    }
  });

  it("rejects stored rich text outside basic formatting", () => {
    for (const node of [
      { type: "image", attrs: { src: "https://x.test/a.png" } },
      { type: "callout", attrs: { type: "info" }, content: [{ type: "paragraph" }] },
      { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "T" }] },
    ]) {
      const diagnostics = diagnosticsOf(() =>
        canonicalizeLayout([
          {
            widgetId: "w1",
            name: "rich-text",
            deletable: true,
            settings: { text: { type: "doc", content: [node] } },
          },
        ]),
      );
      expect(diagnostics[0]?.path, node.type).toContain("/settings/text");
    }
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

  it("rejects unknown blocks even without settings", () => {
    const diagnostics = diagnosticsOf(() => canonicalizeLayout([{ name: "bogus" }]));
    expect(diagnostics[0].path).toBe("/layout/0/name");
    expect(canonicalizeLayout([{ name: "header" }])).toEqual([{ name: "header" }]);
  });

  it("accepts the pricing period switch", () => {
    const settings = {
      pricingSwitcher: true,
      yearlyPriceCaption: "Yearly (2 months free)",
      defaultPeriod: "monthly",
      tiers: [
        {
          name: "Pro",
          price: "$10/month",
          priceYearly: "$100/year",
          features: [],
          buttonAction: "/buy",
          buttonActionYearly: "/buy?period=yearly",
        },
      ],
    };
    expect(canonicalizeLayout([{ name: "pricing", settings }])).toEqual([
      { name: "pricing", settings },
    ]);
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

  it("round-trips theme, chrome, redirects and agent instructions", () => {
    const text = serializeSiteFile({
      theme: themes[0].theme,
      header: { ...blockDefaults.header, ctaLabel: "Sign up" },
      footer: blockDefaults.footer,
      redirects: [{ from: "/old", to: "/new", permanent: true }],
      agentInstructions: "Use for questions about Acme.",
    });
    const parsed = JSON.parse(text);
    expect(parsed.header).toEqual({ ctaLabel: "Sign up" });
    expect(parsed.footer).toBeUndefined();
    expect(parsed.redirects).toEqual([{ from: "/old", to: "/new" }]);
    expect(parsed.agentInstructions).toBe("Use for questions about Acme.");
    expect(serializeSiteFile(parseSiteFile(text))).toBe(text);
  });

  it("accepts the header's GitHub repo, including a cleared one", () => {
    for (const githubRepo of [
      "codelitdev/medialit",
      "https://github.com/codelitdev/medialit",
      "",
    ]) {
      const site = JSON.stringify({ header: { githubRepo, showGithubStars: true } });
      expect(parseSiteFile(site).header).toMatchObject({ githubRepo });
    }
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

describe("toPageText", () => {
  it("cuts rich text saved before the page profile down to it", () => {
    const text = (value: string) => ({ type: "text", text: value });
    const legacy = {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 1 }, content: [text("Title")] },
        { type: "image", attrs: { src: "https://x.test/a.png" } },
        {
          type: "paragraph",
          content: [
            { ...text("hi"), marks: [{ type: "bold" }, { type: "highlight" }] },
          ],
        },
        { type: "callout", attrs: { type: "info" }, content: [{ type: "paragraph" }] },
      ],
    };
    const cleaned = toPageText(legacy);
    expect(cleaned).toEqual({
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [text("Title")] },
        { type: "paragraph", content: [{ ...text("hi"), marks: [{ type: "bold" }] }] },
      ],
    });
    expect(() =>
      canonicalizeLayout([
        {
          widgetId: "w1",
          name: "rich-text",
          deletable: true,
          settings: { text: cleaned },
        },
      ]),
    ).not.toThrow();
  });
});
