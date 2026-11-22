---
"@frontlit/page-builder": minor
---

Rich text in page blocks is basic formatting only: paragraphs, headings 2–4, lists, quotes, code blocks, dividers and line breaks, with bold, italic, strikethrough, inline code and links. The editor no longer offers images, tables, tabs, steps, callouts or other text-editor blocks (pages have their own Media and Embed blocks), and saves, page files and the renderer refuse them, so no route (builder, REST, MCP or Git) can add them. `pageTextProfile` and `PAGE_TEXT_FORMAT` are exported from `@frontlit/page-builder/schema`, and the JSON Schema and MCP `update_page` describe the allowed format.
