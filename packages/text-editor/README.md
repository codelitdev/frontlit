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
# Documentation content profile

`@frontlit/text-editor/docs` is a server-safe entry for documentation validation,
CommonMark/GFM conversion, bounded YAML frontmatter, source-path mapping, and
versioned content hashes (DM-VALIDATE, DM-CONVERT, DM-SOURCE, DM-ROUTE). It does
not load React or instantiate an editor, node view, or upload control. Import
`@frontlit/text-editor/headings` for the lightweight heading policy alone.

```ts
import { parseDocsMarkdown, serializeDocsMarkdown, validateDocsContent } from "@frontlit/text-editor/docs";

const { content, frontmatter } = parseDocsMarkdown(markdown, { file: "manual/setup.md" });
const report = validateDocsContent(content);
const exported = serializeDocsMarkdown(content, frontmatter);
```

Parsing requires frontmatter with a title by default. Use `{ frontmatter: false }`
for editor Markdown bodies with metadata supplied separately. Unsupported content
throws `DocsContentError` with structured diagnostics; validation returns a report
without replacing invalid input with an empty document. A serialization failure
must prevent a draft write.

The profile supports paragraphs, headings 1–6, bold/italic/strike/inline-code/link
marks, nested lists, blockquotes, fenced code, horizontal rules, block images,
and rectangular tables with one header row and one paragraph per cell. It rejects
raw HTML/MDX, task lists, footnotes, inline images, merged/multiblock/aligned tables,
resize attributes, and unsupported marks. Images require stable HTTPS URLs.
URL syntax checks do not establish asset ownership or prove third-party privacy;
the API must verify managed-media provenance separately (DM-MEDIA).

Normalizations apply schema defaults, retain an omitted root array as `[]`, and
represent absent image alt descriptions as `""`. Markdown semantic comparisons
ignore empty top-level paragraphs used for spacing; canonical JSON retains them.
Unknown frontmatter stays bounded plain data. YAML aliases, custom tags, duplicate
keys, and prototype-sensitive metadata keys are rejected. Module safety ceilings
are 1 MiB of Markdown/text, 20,000 nodes, depth 64, and 32 KiB of metadata; request
transport limits can be smaller. Production admission limits remain a separate
operator configuration concern.

Use `<Editor profile="documentation" />` and
`<TextRenderer profile="documentation" />` for docs. The editor omits unsupported
controls and requires a media picker for uploads. Heading IDs use Unicode text,
remove punctuation, and assign unique suffixes in document order. Docs navigation,
validation helpers, rendering, and retrieval use the same policy; the default
editor/renderer profile preserves general-purpose behavior.
