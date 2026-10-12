import type { WidgetMetadata } from "../../models";

export const richTextMetadata: WidgetMetadata = {
  name: "rich-text",
  displayName: "Rich text",
  description:
    "A block of formatted text — paragraphs, headings, lists and links — with no title or media.",
  compatibleWith: ["site", "landing", "blog", "post", "custom"],
};
