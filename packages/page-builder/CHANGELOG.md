# @frontlit/page-builder

## 0.1.0

### Minor Changes

- fb32112: Pricing and Header block fixes, and block icons (#137).

  - Pricing: the grid now has one column per plan (up to 4) on desktop, so 1–2 plans fill the row; a single plan is capped at `max-w-xl`.
  - Pricing: optional Monthly/Yearly switch (`pricingSwitcher`, `monthlyPriceCaption`, `yearlyPriceCaption`, `defaultPeriod`) with per-tier `priceYearly` and `buttonActionYearly`, each falling back to the monthly value. Both prices are server-rendered; a small client island flips between them.
  - Header: the mobile menu button is hidden when the header has no links or CTA.
  - Header: optional GitHub link (`githubRepo` as `owner/repo` or a github.com URL) with an optional star count (`showGithubStars`), fetched in the browser.
  - Every built-in block has its own icon (`metadata.icon`) in the "Add a block" picker and the block settings header, instead of one shared layout icon.

- 9ec98c5: Add `Tabs`, `Table`, `Collapsible`, `NativeSelect` and `InlineCode` primitives (all themed; `Tabs` is a client island, the rest are server-safe), and export `CodeSnippet` from `@frontlit/page-builder/primitives/server`.
- 253e3cf: Page builder fixes and theme/typography features from the Grok bot editor feedback (#43–#49, #33).

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
  - Header and footer logo text falls back to the new `pageData.siteTitle`, and the footer tagline to `pageData.siteSubtitle`. Without a logo the header shows the FrontLit mark (new `FrontLitLogo` component), and without a title either, the FrontLit name.
  - The color mode switcher moved from the header block to the footer block (`showThemeSwitcher` is now a footer setting). In the mobile menu, header links shown as buttons are full width. The mobile menu opens inside the builder preview instead of over the whole editor.

- a367f8a: Rich text in page blocks is basic formatting only: paragraphs, headings 2–4, lists, quotes, code blocks, dividers and line breaks, with bold, italic, strikethrough, inline code and links. The editor no longer offers images, tables, tabs, steps, callouts or other text-editor blocks (pages have their own Media and Embed blocks), and saves, page files and the renderer refuse them, so no route (builder, REST, MCP or Git) can add them. `pageTextProfile` and `PAGE_TEXT_FORMAT` are exported from `@frontlit/page-builder/schema`, and the JSON Schema and MCP `update_page` describe the allowed format.

### Patch Changes

- 8784af1: Accessibility fixes in site chrome: the `Drawer` trigger props now go on the trigger element instead of a wrapping `span` (no more `aria-expanded` on a non-interactive element), and footer column titles are `h2` instead of `h4`, so headings no longer skip levels.
- 86100b2: The `Image` primitive now goes through the host's image resolver, like block images, so blog, docs and feed images are resized by the host's optimizer. It also accepts `priority` for above-the-fold images. The resolver is shared across the package's entry points.
- b81387d: `Section` clips its content with `overflow: clip` instead of `overflow: hidden`, so sticky elements inside a section (such as a docs sidebar) stick to the viewport again.
- Updated dependencies [fc2a99f]
- Updated dependencies [08c80fc]
- Updated dependencies [faed9fa]
- Updated dependencies [b3490c4]
- Updated dependencies [253e3cf]
- Updated dependencies [121ad02]
- Updated dependencies [d32aba4]
- Updated dependencies [e518076]
- Updated dependencies [2b73b72]
- Updated dependencies [d035eb3]
  - @frontlit/text-editor@0.1.0
  - @frontlit/media-uploader@0.1.0

## 0.1.0-alpha.11

### Patch Changes

- Updated dependencies [121ad02]
  - @frontlit/text-editor@0.1.0-alpha.7

## 0.1.0-alpha.10

### Patch Changes

- Updated dependencies [fc2a99f]
  - @frontlit/text-editor@0.1.0-alpha.6

## 0.1.0-alpha.9

### Patch Changes

- Updated dependencies [2b73b72]
  - @frontlit/text-editor@0.1.0-alpha.5

## 0.1.0-alpha.8

### Patch Changes

- Updated dependencies [08c80fc]
  - @frontlit/text-editor@0.1.0-alpha.4

## 0.1.0-alpha.7

### Minor Changes

- 9ec98c5: Add `Tabs`, `Table`, `Collapsible`, `NativeSelect` and `InlineCode` primitives (all themed; `Tabs` is a client island, the rest are server-safe), and export `CodeSnippet` from `@frontlit/page-builder/primitives/server`.

### Patch Changes

- 8784af1: Accessibility fixes in site chrome: the `Drawer` trigger props now go on the trigger element instead of a wrapping `span` (no more `aria-expanded` on a non-interactive element), and footer column titles are `h2` instead of `h4`, so headings no longer skip levels.
- b81387d: `Section` clips its content with `overflow: clip` instead of `overflow: hidden`, so sticky elements inside a section (such as a docs sidebar) stick to the viewport again.

## 0.1.0-alpha.6

### Patch Changes

- 86100b2: The `Image` primitive now goes through the host's image resolver, like block images, so blog, docs and feed images are resized by the host's optimizer. It also accepts `priority` for above-the-fold images. The resolver is shared across the package's entry points.

## 0.1.0-alpha.5

### Minor Changes

- fb32112: Pricing and Header block fixes, and block icons (#137).

  - Pricing: the grid now has one column per plan (up to 4) on desktop, so 1–2 plans fill the row; a single plan is capped at `max-w-xl`.
  - Pricing: optional Monthly/Yearly switch (`pricingSwitcher`, `monthlyPriceCaption`, `yearlyPriceCaption`, `defaultPeriod`) with per-tier `priceYearly` and `buttonActionYearly`, each falling back to the monthly value. Both prices are server-rendered; a small client island flips between them.
  - Header: the mobile menu button is hidden when the header has no links or CTA.
  - Header: optional GitHub link (`githubRepo` as `owner/repo` or a github.com URL) with an optional star count (`showGithubStars`), fetched in the browser.
  - Every built-in block has its own icon (`metadata.icon`) in the "Add a block" picker and the block settings header, instead of one shared layout icon.

## 0.1.0-alpha.4

### Minor Changes

- 253e3cf: Page builder fixes and theme/typography features from the Grok bot editor feedback (#43–#49, #33).

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
  - Header and footer logo text falls back to the new `pageData.siteTitle`, and the footer tagline to `pageData.siteSubtitle`. Without a logo the header shows the FrontLit mark (new `FrontLitLogo` component), and without a title either, the FrontLit name.
  - The color mode switcher moved from the header block to the footer block (`showThemeSwitcher` is now a footer setting). In the mobile menu, header links shown as buttons are full width. The mobile menu opens inside the builder preview instead of over the whole editor.

### Patch Changes

- Updated dependencies [faed9fa]
- Updated dependencies [253e3cf]
  - @frontlit/media-uploader@0.1.0-alpha.1
  - @frontlit/text-editor@0.1.0-alpha.3
