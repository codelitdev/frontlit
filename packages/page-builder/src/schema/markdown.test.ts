import { describe, expect, it } from "vitest";
import { layoutToMarkdown } from "./markdown";

const paragraph = (text: string) => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});

describe("layoutToMarkdown", () => {
  it("renders headings, text, buttons as links and cards as lists", () => {
    const markdown = layoutToMarkdown(
      [
        { name: "header", settings: { title: "Acme" } },
        {
          name: "hero",
          settings: {
            title: "Ship faster",
            description: paragraph("One tool for it all."),
            buttonCaption: "Start",
            buttonAction: "/signup",
            secondaryButtonCaption: "",
            secondaryButtonAction: "",
          },
        },
        { name: "media", settings: {} },
        {
          name: "grid",
          settings: {
            title: "Features",
            items: [{ title: "Fast", description: "Very." }],
          },
        },
        {
          name: "faq",
          settings: { title: "FAQ", items: [{ question: "Why?", answer: "Because." }] },
        },
        { name: "data-slot", settings: { slot: "content-feed" } },
        { name: "footer", settings: {} },
      ],
      { slot: () => "FEED" },
    );
    expect(markdown).toBe(`## Ship faster

One tool for it all.

[Start](/signup)

## Features

- **Fast**: Very.

## FAQ

### Why?

Because.

FEED`);
  });

  it("uses block defaults like the renderer", () => {
    expect(layoutToMarkdown([{ name: "hero" }])).toContain(
      "## Run your whole business",
    );
  });

  it("skips blocks it can't read", () => {
    expect(layoutToMarkdown([{ name: "nope", settings: {} }])).toBe("");
  });

  it("renders an app's own blocks with the serializers it passes", () => {
    const markdown = layoutToMarkdown(
      [
        {
          name: "curriculum",
          settings: { title: "What you'll learn", lessons: ["Intro", "Setup"] },
        },
        { name: "broken", settings: {} },
        { name: "content", settings: { title: "About", body: paragraph("Hi.") } },
      ],
      {
        blocks: {
          curriculum: (s) => [
            `## ${s.title}`,
            s.lessons.map((l: string) => `- ${l}`).join("\n"),
          ],
          broken: () => {
            throw new Error("bad settings");
          },
        },
      },
    );
    expect(markdown).toBe(
      "## What you'll learn\n\n- Intro\n- Setup\n\n## About\n\nHi.",
    );
  });

  it("lets an app replace a built-in block's Markdown", () => {
    expect(
      layoutToMarkdown([{ name: "header", settings: { title: "Acme" } }], {
        blocks: { header: (s) => `# ${s.title}` },
      }),
    ).toBe("# Acme");
  });
});
