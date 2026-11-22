import { defineProfile } from "@frontlit/text-editor/blocks";

/**
 * What a page block's rich text can hold: paragraphs, headings 2–4, lists,
 * quotes, code blocks, dividers and line breaks, with bold, italic,
 * strikethrough, inline code and links. Images, video and embeds are page
 * blocks, so there are no text-editor blocks here, and no tables. The
 * builder's editor, the renderer, validation and Markdown files all use it,
 * so nothing outside it can be written, through any route, or shown.
 */
export const pageTextProfile = defineProfile({
  base: {
    exclude: ["table"],
    // No Markdown form, and page files are Markdown.
    marks: { exclude: ["underline", "highlight"] },
    // The block title is the section's heading.
    headings: { levels: [2, 3, 4] },
  },
  options: { name: "page", tables: "simple" },
});

/** The format, for schema and tool descriptions read by people and agents. */
export const PAGE_TEXT_FORMAT =
  "Markdown: paragraphs, headings (## to ####), - and 1. lists, > quotes, ``` code blocks, --- dividers and line breaks (two trailing spaces), with **bold**, *italic*, ~~strike~~, `code` and [links](https://… or /path or mailto:…). Nothing else: no # headings, tables, images, raw HTML or <Block> tags (use page blocks for media and embeds).";

type Node = {
  type?: string;
  attrs?: Record<string, unknown>;
  marks?: { type?: string }[];
  content?: Node[];
  [key: string]: unknown;
};

/**
 * Drops what the page text profile doesn't hold (images, tables, text-editor
 * blocks, underline and highlight) and moves headings into 2–4. For rich text
 * saved before the profile: the builder opens it and the site renders it, and
 * the builder's next save stores the cleaned text.
 */
export function toPageText<T>(doc: T): T {
  const { nodeNames, marks, headingLevels } = pageTextProfile;
  const [min, max] = [headingLevels[0], headingLevels[headingLevels.length - 1]];
  const clean = (node: Node): Node | null => {
    if (!node || typeof node !== "object" || !nodeNames.has(node.type ?? ""))
      return null;
    const next: Node = { ...node };
    if (node.type === "heading" && typeof node.attrs?.level === "number")
      next.attrs = {
        ...node.attrs,
        level: Math.min(max, Math.max(min, node.attrs.level)),
      };
    if (node.marks)
      next.marks = node.marks.filter((mark) => marks.includes(mark.type as never));
    if (Array.isArray(node.content))
      next.content = node.content
        .map(clean)
        .filter((child): child is Node => child !== null);
    return next;
  };
  if (!doc || typeof doc !== "object" || (doc as Node).type !== "doc") return doc;
  return clean(doc as Node) as T;
}

/** `toPageText` on every rich-text value in block settings (any `{ type: "doc" }`). */
export function toPageTextSettings<T>(value: T): T {
  if (Array.isArray(value)) return value.map(toPageTextSettings) as T;
  if (!value || typeof value !== "object") return value;
  if ((value as Node).type === "doc") return toPageText(value);
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, toPageTextSettings(item)]),
  ) as T;
}
