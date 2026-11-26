# @frontlit/text-editor

## 0.2.0

### Minor Changes

- c417e00: `Editor`, `TextRenderer` and `ContentRenderer` take an optional `labels` prop to translate their built-in text: the toolbar, selection menu, link editor, `/` menu (entries, sections, descriptions, footer), table bar, drag handle tooltip, default placeholder and accessible name, the messages passed to `onError`, and the renderer's code copy button, code-group tab names, type-table headings and the fallback titles of embeds, videos, H5P, PDFs and files. Labels with a value in them are functions (`heading: (level) => …`, `wordCount: (count) => …`, `deleteRow: (row) => …`), so any translator works. Anything not passed stays English; `TextEditorLabels` and `defaultTextEditorLabels` are exported from both `@frontlit/text-editor` and `@frontlit/text-editor/renderer`. `getInsertItems` and `tableActions` accept the labels too, and `DragHandle` takes a `title` option.

## 0.1.0

### Minor Changes

- 08c80fc: Add editable documentation blocks for callouts, tabs, steps, cards, accordions, code groups, and type tables, with Markdown import and export.
- 253e3cf: `Editor` delivers an edit that is still waiting on its debounce when it unmounts, instead of dropping it. A new `debounceMs` prop (default 1000) sets how long it waits after the last edit before calling `onChange`.
- 121ad02: Add pluggable blocks. `defineProfile` builds the schema, Markdown parser and serializer, validator (with availability checks), renderer and a format reference from one list of blocks; the new server-safe `@frontlit/text-editor/blocks` entry exports it with a block library (Image, Video, Audio, PDF, File, Embed, Callout, Tabs, Accordion, Steps). The editor gains a `/` insert menu, drag handles, block settings popovers, a media picker and an `unavailable` prop; `TextRenderer` accepts profile objects, host block components and `resolveMedia`. The default and documentation setups are rebuilt on profiles with unchanged Markdown output. Blocks work from the keyboard (Ctrl/⌘+Shift+↑/↓ moves a block, Alt+F10 reaches its controls, Escape returns) and with screen readers: the editing area is a labelled textbox (new `ariaLabel` prop) and the `/` menu is announced through `aria-activedescendant`. The `/` menu shows blocks in sections (Text, Media, Layout, or a block's own `insert.group`) with a description under each, and lists its keys in a footer. New library blocks: Button, WebPreview and H5P (allowed hosts only), plus a `success` callout type and Warning / Tip / Success / Danger callout presets in the `/` menu; all are in the documentation profile, so the API and MCP accept them. `contentFormat()`, `describeContentFormat()` and `schema/content.v1.json` describe the format for AI agents. Attributes can be `requiredToPublish`, and `incompleteBlocks(profile, content)` reports blocks saved without them (publish blockers, never save errors); the format reference now lists Markdown-only props (`docs.props`), child tags and the accepted literal syntax.

### Patch Changes

- fc2a99f: `parseDocsMarkdown` now gives schema failures found after conversion (such as a list item that starts with another list, `- 1. Step`) the file, line and column of the Markdown block that produced them, instead of only a JSON path.
- b3490c4: The editor's fallback colour tokens have a dark set, used under a `.dark` ancestor. Links, the toolbar and the selection and `/` menus no longer keep light-theme colours in a dark host, where links were dark on dark.
- d32aba4: The selection formatting menu works from the keyboard. Escape in the text closes it until the selection changes. Alt+F10 with text selected moves focus into it, where ←/→/Home/End move between buttons and Escape returns to the text with the selection kept. Escape in its link field returns to the link button. It is a toolbar labelled "Text formatting", and its mark buttons report whether they are on (`aria-pressed`).

  Ctrl/⌘+Shift+Space does what Alt+F10 does (formatting menu, table bar, block controls), for keyboards where Alt+F10 doesn't reach the page, such as laptop F-rows or GPU overlays that take it.

- e518076: `ContentRenderer` keeps host-rendered blocks mounted across re-renders, so a block with its own state (a quiz's answers and result, a playing video) no longer resets when the page around it re-renders. Host blocks also get the same vertical spacing as the library's blocks, so two of them in a row no longer touch. Small block buttons in the editor (such as the Video block's "Use") no longer wrap.
- 2b73b72: Use one version range (`^3.31.3`) for every `@tiptap/*` dependency. Three packages were pinned to exactly 3.31.3 while the rest floated, so a fresh npm install pulled two copies of `@tiptap/core` and `@tiptap/extension-table` crashed with "does not provide an export named 'isValidCSSStyleValue'". This broke `npx @frontlit/preview@alpha`.
- d035eb3: `TextRenderer` underlines links inside rich text whatever the theme's link style. Themes style links for navigation (often `no-underline` with `hover:underline`), which left links in a sentence marked only by a slightly heavier weight (WCAG 1.4.1). The theme's colour, weight and hover still apply; navigation links are unchanged.

## 0.1.0-alpha.7

### Minor Changes

- 121ad02: Add pluggable blocks. `defineProfile` builds the schema, Markdown parser and serializer, validator (with availability checks), renderer and a format reference from one list of blocks; the new server-safe `@frontlit/text-editor/blocks` entry exports it with a block library (Image, Video, Audio, PDF, File, Embed, Callout, Tabs, Accordion, Steps). The editor gains a `/` insert menu, drag handles, block settings popovers, a media picker and an `unavailable` prop; `TextRenderer` accepts profile objects, host block components and `resolveMedia`. The default and documentation setups are rebuilt on profiles with unchanged Markdown output. Blocks work from the keyboard (Ctrl/⌘+Shift+↑/↓ moves a block, Alt+F10 reaches its controls, Escape returns) and with screen readers: the editing area is a labelled textbox (new `ariaLabel` prop) and the `/` menu is announced through `aria-activedescendant`. The `/` menu shows blocks in sections (Text, Media, Layout, or a block's own `insert.group`) with a description under each, and lists its keys in a footer. New library blocks: Button, WebPreview and H5P (allowed hosts only), plus a `success` callout type and Warning / Tip / Success / Danger callout presets in the `/` menu; all are in the documentation profile, so the API and MCP accept them. `contentFormat()`, `describeContentFormat()` and `schema/content.v1.json` describe the format for AI agents. Attributes can be `requiredToPublish`, and `incompleteBlocks(profile, content)` reports blocks saved without them (publish blockers, never save errors); the format reference now lists Markdown-only props (`docs.props`), child tags and the accepted literal syntax.

## 0.1.0-alpha.6

### Patch Changes

- fc2a99f: `parseDocsMarkdown` now gives schema failures found after conversion (such as a list item that starts with another list, `- 1. Step`) the file, line and column of the Markdown block that produced them, instead of only a JSON path.

## 0.1.0-alpha.5

### Patch Changes

- 2b73b72: Use one version range (`^3.31.3`) for every `@tiptap/*` dependency. Three packages were pinned to exactly 3.31.3 while the rest floated, so a fresh npm install pulled two copies of `@tiptap/core` and `@tiptap/extension-table` crashed with "does not provide an export named 'isValidCSSStyleValue'". This broke `npx @frontlit/preview@alpha`.

## 0.1.0-alpha.4

### Minor Changes

- 08c80fc: Add editable documentation blocks for callouts, tabs, steps, cards, accordions, code groups, and type tables, with Markdown import and export.

## 0.1.0-alpha.3

### Minor Changes

- 253e3cf: `Editor` delivers an edit that is still waiting on its debounce when it unmounts, instead of dropping it. A new `debounceMs` prop (default 1000) sets how long it waits after the last edit before calling `onChange`.
