# @frontlit/text-editor

A TipTap-based rich text editor and static renderer for React. Framework-agnostic: it depends only on `react` / `react-dom`. No Next.js, no backend, and no media-upload service.

Uploaded images are embedded as data URLs by default. Hosts can replace that with their own picker via `ImagePickerContextProvider`.

## Installation

```sh
npm i @frontlit/text-editor
# or
pnpm add @frontlit/text-editor
```

Peer dependencies: `react` and `react-dom` (^18 or ^19).

### CSS

Import the compiled stylesheet. It includes Tailwind utilities, fallback
tokens for the editor chrome, ProseMirror/renderer rules, and a small
highlight.js theme. Tailwind is **not** required in the host:

```ts
import "@frontlit/text-editor/styles.css";
```

If you already run Tailwind CSS v4 and want to generate the utilities yourself,
skip `styles.css`, scan the package, and import the prose rules (lists,
blockquotes, code blocks — these are not utilities):

```css
@import "@frontlit/text-editor/tokens.css";
@import "@frontlit/text-editor/prose.css";
@source "./node_modules/@frontlit/text-editor";
```

## Usage

```tsx
import { Editor, TextRenderer, emptyDoc } from "@frontlit/text-editor";
import "@frontlit/text-editor/styles.css";

<Editor initialContent={emptyDoc} onChange={(json) => save(json)} />;
<TextRenderer json={savedJson} />;
```

## What's inside

- `Editor` — the WYSIWYG editing surface (toolbar, bubble menu, tables, code blocks with syntax highlighting, images, links).
- `TextRenderer` — renders saved `TextEditorContent` (TipTap JSON) as static React elements. Accepts an optional, loosely-typed `theme` prop (see `TextRendererTheme`) to theme headings/paragraphs/links; without one it falls back to plain semantic HTML tags.
- `TextEditorContent` — the TipTap doc-JSON type both of the above operate on.
- `normalizeTextEditorContent`, `extractTextFromTextEditorContent`, `truncateTextEditorContent` — content utilities (e.g. for building excerpts).
- `emptyDoc`, `createExtensions`, `createId`, `extractHeadings`, `extractTextFromNode` — lower-level building blocks, exported for advanced use.
- `ImagePickerContextProvider` — optional hook so a host can supply its own image-upload UI.

`TextRenderer` is structurally typed against a small `TextRendererTheme` instead of importing `@frontlit/page-builder`, so this package stays usable on its own.

## License

MIT
