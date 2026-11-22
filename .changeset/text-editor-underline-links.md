---
"@frontlit/text-editor": patch
---

`TextRenderer` underlines links inside rich text whatever the theme's link style. Themes style links for navigation (often `no-underline` with `hover:underline`), which left links in a sentence marked only by a slightly heavier weight (WCAG 1.4.1). The theme's colour, weight and hover still apply; navigation links are unchanged.
