# @frontlit/text-editor

## 0.1.0-alpha.8

### Patch Changes

- e518076: `ContentRenderer` keeps host-rendered blocks mounted across re-renders, so a block with its own state (a quiz's answers and result, a playing video) no longer resets when the page around it re-renders. Host blocks also get the same vertical spacing as the library's blocks, so two of them in a row no longer touch. Small block buttons in the editor (such as the Video block's "Use") no longer wrap.

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
