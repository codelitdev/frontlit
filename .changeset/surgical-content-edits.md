---
"@frontlit/text-editor": minor
"@frontlit/page-builder": minor
---

Add surgical edits: `applyTextEdits` (exact-match `str_replace` edits), `toEditableMarkdown` / `fromEditableMarkdown` (Markdown that round-trips any content exactly, with blocks Markdown can't express kept as fenced `tiptap` JSON) and `editContent` in `@frontlit/text-editor/blocks`, and `editPageDocument` (edits through the canonical page file) in `@frontlit/page-builder/schema`.
