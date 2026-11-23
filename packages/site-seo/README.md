# @frontlit/site-seo

Framework-free builders that make a public site readable by search engines
and AI agents. Bring your own content and routes; these return strings and
plain objects.

| Export | What it builds |
| --- | --- |
| `buildRobotsTxt` | `robots.txt`: everyone may crawl, AI search crawlers are allowed by name, AI training crawlers are blocked with `blockAiTraining`, and a hidden site blocks everyone |
| `AI_SEARCH_CRAWLERS`, `AI_TRAINING_CRAWLERS` | The user agents behind those rules |
| `buildSitemapXml` | `sitemap.xml` from site-relative paths |
| `buildLlmsTxt`, `markdownDocument` | `llms.txt` ([llmstxt.org](https://llmstxt.org)) and Markdown pages for agents |
| `prefersMarkdown`, `markdownSourcePath`, `markdownUrl`, `isNegotiablePath` | Deciding when a request wants Markdown (`<path>.md` or `Accept: text/markdown`) |
| `organizationAndWebsiteJsonLd`, `blogPostingJsonLd`, `techArticleJsonLd`, `changelogJsonLd`, `serializeJsonLd` | JSON-LD blocks |
| `buildRssFeed` | RSS 2.0 feeds |

```ts
import { buildRobotsTxt } from "@frontlit/site-seo";

export function GET() {
  return new Response(
    buildRobotsTxt({ canonicalHost: "example.com", blockAiTraining: true }),
    { headers: { "content-type": "text/plain; charset=utf-8" } },
  );
}
```

Page layouts become Markdown with `layoutToMarkdown` from
`@frontlit/page-builder/schema`.
