---
"@frontlit/page-builder": patch
---

Accessibility fixes in site chrome: the `Drawer` trigger props now go on the trigger element instead of a wrapping `span` (no more `aria-expanded` on a non-interactive element), and footer column titles are `h2` instead of `h4`, so headings no longer skip levels.
