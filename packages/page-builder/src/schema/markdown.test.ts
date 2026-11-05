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
      () => "FEED",
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
});
