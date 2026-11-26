---
"@frontlit/text-editor": minor
---

`Editor`, `TextRenderer` and `ContentRenderer` take an optional `labels` prop to translate their built-in text: the toolbar, selection menu, link editor, `/` menu (entries, sections, descriptions, footer), table bar, drag handle tooltip, default placeholder and accessible name, the messages passed to `onError`, and the renderer's code copy button, code-group tab names, type-table headings and the fallback titles of embeds, videos, H5P, PDFs and files. Labels with a value in them are functions (`heading: (level) => …`, `wordCount: (count) => …`, `deleteRow: (row) => …`), so any translator works. Anything not passed stays English; `TextEditorLabels` and `defaultTextEditorLabels` are exported from both `@frontlit/text-editor` and `@frontlit/text-editor/renderer`. `getInsertItems` and `tableActions` accept the labels too, and `DragHandle` takes a `title` option.
