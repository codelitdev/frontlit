import { describe, expect, it } from "vitest";
import { createHeadingIdGenerator, extractDocsHeadings } from "./headings";

describe("DM-CONVERT heading policy", () => {
  it("V29: handles Unicode, punctuation, blank headings and suffix collisions", () => {
    const next = createHeadingIdGenerator();
    expect(["Setup!", "Setup!", "Setup-2", "世界", "", "!!!"].map(next)).toEqual([
      "setup",
      "setup-2",
      "setup-2-2",
      "世界",
      "section",
      "section-2",
    ]);
  });
  it("V29: walks headings in nested blocks and joins formatted text without invented spaces", () => {
    expect(
      extractDocsHeadings({
        type: "doc",
        content: [
          {
            type: "blockquote",
            content: [
              {
                type: "heading",
                attrs: { level: 4 },
                content: [
                  { type: "text", text: "Set" },
                  { type: "text", text: "up" },
                ],
              },
            ],
          },
        ],
      }),
    ).toEqual([{ level: 4, text: "Setup", id: "setup" }]);
  });
});
