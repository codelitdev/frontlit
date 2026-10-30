---
"@frontlit/page-builder": patch
---

`Section` clips its content with `overflow: clip` instead of `overflow: hidden`, so sticky elements inside a section (such as a docs sidebar) stick to the viewport again.
