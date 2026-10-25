---
"@frontlit/page-builder": patch
---

The `Image` primitive now goes through the host's image resolver, like block images, so blog, docs and feed images are resized by the host's optimizer. It also accepts `priority` for above-the-fold images. The resolver is shared across the package's entry points.
