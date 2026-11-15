---
"@frontlit/text-editor": patch
---

Use one version range (`^3.31.3`) for every `@tiptap/*` dependency. Three packages were pinned to exactly 3.31.3 while the rest floated, so a fresh npm install pulled two copies of `@tiptap/core` and `@tiptap/extension-table` crashed with "does not provide an export named 'isValidCSSStyleValue'". This broke `npx @frontlit/preview@alpha`.
