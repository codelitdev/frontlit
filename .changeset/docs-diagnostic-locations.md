---
"@frontlit/text-editor": patch
---

`parseDocsMarkdown` now gives schema failures found after conversion (such as a list item that starts with another list, `- 1. Step`) the file, line and column of the Markdown block that produced them, instead of only a JSON path.
