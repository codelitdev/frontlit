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
