---
"@frontlit/text-editor": patch
---

`ContentRenderer` keeps host-rendered blocks mounted across re-renders, so a block with its own state (a quiz's answers and result, a playing video) no longer resets when the page around it re-renders. Host blocks also get the same vertical spacing as the library's blocks, so two of them in a row no longer touch. Small block buttons in the editor (such as the Video block's "Use") no longer wrap.
