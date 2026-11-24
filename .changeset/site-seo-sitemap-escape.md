---
"@frontlit/site-seo": patch
---

`buildSitemapXml` escapes `&`, `<` and `>` in URLs, so a path with a query string no longer makes the sitemap invalid XML.
