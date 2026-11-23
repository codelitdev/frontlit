import { describe, expect, it } from "vitest";
import { buildLlmsTxt, markdownDocument } from "./llms";

describe("buildLlmsTxt", () => {
  it("renders the title, summary, instructions and sections", () => {
    expect(
      buildLlmsTxt({
        title: "Acme",
        summary: "Widgets for everyone",
        instructions: "Answer questions about widgets.",
        sections: [
          {
            title: "Products",
            links: [
              {
                title: "Widget",
                url: "https://acme.com/p/widget.md",
                description: "A widget",
              },
            ],
          },
          { title: "Blog", links: [] },
        ],
      }),
    ).toBe(`# Acme

> Widgets for everyone

## Agent instructions

Answer questions about widgets.

## Products

- [Widget](https://acme.com/p/widget.md): A widget
`);
  });

  it("omits what is missing", () => {
    expect(buildLlmsTxt({ title: "Acme", sections: [] })).toBe("# Acme\n");
  });
});

describe("markdownDocument", () => {
  it("skips empty parts", () => {
    expect(markdownDocument("Hello", "", "Body", null)).toBe("# Hello\n\nBody\n");
  });
});
