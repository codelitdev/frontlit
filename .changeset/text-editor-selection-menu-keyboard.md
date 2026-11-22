---
"@frontlit/text-editor": patch
---

The selection formatting menu works from the keyboard. Escape in the text closes it until the selection changes. Alt+F10 with text selected moves focus into it, where ←/→/Home/End move between buttons and Escape returns to the text with the selection kept. Escape in its link field returns to the link button. It is a toolbar labelled "Text formatting", and its mark buttons report whether they are on (`aria-pressed`).
