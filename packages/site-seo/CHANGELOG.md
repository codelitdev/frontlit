# @frontlit/site-seo

## 0.1.1

### Patch Changes

- 84b944c: `buildSitemapXml` escapes `&`, `<` and `>` in URLs, so a path with a query string no longer makes the sitemap invalid XML.

## 0.1.0

### Minor Changes

- 7e45262: New package: framework-free robots.txt (allows AI search crawlers and can block AI training crawlers), sitemap, llms.txt, Markdown negotiation, JSON-LD and RSS builders for public sites.
