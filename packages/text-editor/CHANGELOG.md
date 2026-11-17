# @frontlit/text-editor

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
