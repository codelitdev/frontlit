# @frontlit/text-editor

A TipTap-based rich text editor and renderer, extracted from
`@frontlit/page-builder` into its own package (adapted from CourseLit's
`packages/text-editor`). Fully standalone — no dependency on
`@frontlit/page-builder` or any backend/media-upload service.

## What's inside

- `Editor` — the WYSIWYG editing surface (toolbar, bubble menu, tables,
  code blocks with syntax highlighting, images, links). Uploaded images are
  embedded as data URLs, so no media/upload backend is required.
- `TextRenderer` — renders saved `TextEditorContent` (TipTap JSON) as static
  React elements. Accepts an optional, loosely-typed `theme` prop (see
  `TextRendererTheme` in `renderer-theme.ts`) to theme headings/paragraphs/
  links; without one it falls back to plain semantic HTML tags.
- `TextEditorContent` — the TipTap doc-JSON type both of the above operate on.
- `normalizeTextEditorContent`, `extractTextFromTextEditorContent`,
  `truncateTextEditorContent` — small content utilities (e.g. for building
  post excerpts).
- `emptyDoc`, `createExtensions`, `createId`, `extractHeadings`,
  `extractTextFromNode` — the lower-level building blocks `Editor` and
  `TextRenderer` are built from, exported for advanced use.

## Why `TextRenderer` lives here (not in `page-builder`)

CourseLit splits editing (`text-editor` package) from rendering
(`TextRenderer` lives in `page-blocks`, which depends on `page-primitives`
for themed heading/link components). In FrontLit, editing and rendering are
combined into a single `text-editor` package instead, since they operate on
the exact same content shape and extensions. To avoid a circular dependency
(`page-builder` needs `text-editor`'s `Editor`; `text-editor` must not need
`page-builder`'s themed primitives), `TextRenderer` accepts a small,
structurally-typed `TextRendererTheme` instead of importing
`@frontlit/page-builder`'s `ThemeStyle`/`Header1`/`Link` components
directly — any object shaped like a theme (including page-builder's real
`ThemeStyle`) is assignable, and the equivalent typography classes are
applied inline.

## Usage

```tsx
import { Editor, TextRenderer, emptyDoc } from "@frontlit/text-editor";
import "@frontlit/text-editor/styles.css"; // only needed if you don't run your own Tailwind build

<Editor initialContent={emptyDoc} onChange={(json) => save(json)} />;
<TextRenderer json={savedJson} />;
```

## Building

```sh
pnpm --filter @frontlit/text-editor build        # tsup + tailwind CSS build
pnpm --filter @frontlit/text-editor check-types   # tsc --noEmit over all of src
```
