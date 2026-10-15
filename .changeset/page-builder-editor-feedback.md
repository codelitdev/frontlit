---
"@frontlit/page-builder": minor
---

Page builder fixes and theme/typography features from the Grok bot editor feedback (#43–#49, #33).

- Rich-text block fields sync to the canvas after 150 ms and flush pending edits when the panel closes, so text is no longer lost. The builder also flushes its save debounce on unmount.
- The "+" between blocks is clickable again; "Add block" inserts after the selected block, and new blocks scroll into view and flash.
- Deleting a block asks for confirmation in a dialog.
- Theme editor: editing a built-in theme previews a renameable copy until "Use this theme"; all typography levels are edited on one screen; colours accept oklch and other CSS colour functions and flag invalid values.
- Block titles get a heading level (H1–H3; Hero defaults to H1, other blocks to H2) and per-device size overrides on the Design tab. Header and footer logos are no longer headings.
- Fluid typography: heading levels can scale between a phone and a desktop size (`clamp()`), with a new Display level for hero headlines. Built-in themes ship with fluid sizes, balanced wrapping and roomier line height on phones.
- Words wrapped in `*asterisks*` in block titles are highlighted, in the primary colour or as a marker (new theme `highlight` setting).
- New `CodeSnippet` primitive, "Code snippet" block and Hero install-command field, with a new optional `code` typography level.
- New "Terminal" built-in theme, a section hairline option (`structure.section.dividers`), and four new self-hosted fonts: Archivo, JetBrains Mono, Hanken Grotesk and Spline Sans Mono (new Mono category).
- Hero gets an optional small-print line under the buttons.
- Device previews keep the page at exactly 390px/768px by accounting for the iframe scrollbar.
- New primitives and helpers: `Display`, `createHeading`, `fluidFontSize`, `HeadingTag`, and an `as` prop on `Header1`–`Header4`. `debounce()` now returns a function with `flush()`.
