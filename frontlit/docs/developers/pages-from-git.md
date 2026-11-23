---
title: Pages from Git
description: Keep landing pages in your repository as JSON files and publish them on every push.
nav_order: 40
---

Your site's pages can live in your own repository, next to your product code.
Coding agents and teammates edit them in pull requests; FrontLit publishes the
folder on every push to your publishing branch.

## Turn it on

Connect GitHub in **Settings → Integrations**. On the folder step, choose the
**site folder** (default `frontlit`, or empty for the repository root) and tick
**Landing pages** (untick **Docs** if your docs live elsewhere). Then:

- If `<site folder>/pages` already has page files,
  **Check repository** previews the routes, problems and any builder pages that
  would go offline. **Finish setup** connects and publishes them in one step.
- If the folder doesn't exist yet, connect anyway, then open the repository
  dialog and **Export pages**. That opens a pull request adding your current
  pages, header, footer and theme to the folder. Merging it turns pages sync
  on. Exported files re-import byte for byte.

An already-connected repository can turn pages on later from the **Pages**
section of the same dialog.

From then on every page and the site chrome are owned by the repository. In the
page builder, drafts stay editable and **Publish** becomes **Create pull request**.
**Stop syncing** hands pages back to the builder; what's live stays live.

## Files

Everything FrontLit syncs lives in one site folder, `frontlit/` by default:

```text
frontlit/
├─ site.json          # header, footer, theme, redirects, agent instructions (optional)
├─ docs/              # Markdown docs → /docs/...
└─ pages/
   ├─ index.json      # /
   ├─ pricing.json    # /pricing
   └─ blog.json       # /blog
```

- The file name is the URL: lowercase letters, numbers and hyphens.
  `index.json` is the homepage. Folders inside `pages/` aren't supported yet.
- `site.json` sits at the root of the site folder. Without it, the current
  header and footer stay.
- Some paths are reserved by the site (`/embed`, `/api`, `/schema`, …).

A page file:

```json
{
  "$schema": "https://frontlit.app/schema/page.v1.json",
  "title": "Pricing – Acme",
  "description": "Simple plans for every team.",
  "layout": [
    {
      "name": "hero",
      "settings": {
        "title": "Pricing that *scales* with you",
        "description": "Start free, upgrade when you **grow**.",
        "media": { "url": "../images/pricing.png", "alt": "Plans side by side" }
      }
    },
    { "name": "pricing" },
    { "name": "faq", "settings": { "items": [{ "question": "Can I cancel?", "answer": "Any time." }] } }
  ]
}
```

- `layout` lists blocks top to bottom. A block's `settings` only needs what
  differs from the block's defaults; the JSON Schema documents every setting and
  its default.
- Rich-text settings are Markdown (CommonMark + GFM).
- Media is `{ "url", "alt" }`. The URL is an `https://` URL, or a path in the
  repository (no scheme), relative to the file or to the repository root when
  it starts with `/`; FrontLit uploads the image when it syncs. `http://` and
  other schemes are rejected.
- `"published": false` keeps a page as a draft. `"robotsAllowed": false` asks
  search engines not to index it.
- The blog, docs and changelog pages hold their feed with
  `{ "name": "content-feed" }`.

`site.json`:

```json
{
  "$schema": "https://frontlit.app/schema/site.v1.json",
  "header": { "links": [{ "label": "Pricing", "href": "/pricing" }], "ctaLabel": "Sign up", "ctaHref": "/signup" },
  "footer": { "tagline": "The front office of your SaaS." },
  "redirects": [{ "from": "/plans", "to": "/pricing" }],
  "agentInstructions": "Use this site for questions about Acme's API and pricing."
}
```

`agentInstructions` is optional Markdown for AI agents: what the site is for
and when to use it. It shows as its own section of the site's `/llms.txt`.

## Markdown for AI agents

Every site also serves its public content as Markdown:

- Request any page, docs page, blog post or the changelog with
  `Accept: text/markdown`, or add `.md` to its URL (`/docs/setup.md`,
  `/index.md` for the homepage). Browsers keep getting HTML.
- A missing page requested as Markdown returns a 404 with a short Markdown
  body that links to `/llms.txt` and `/sitemap.xml`.
- `/llms.txt` lists the site's pages, docs, blog posts, changelog and OpenAPI
  spec with links to their `.md` URLs. Pages with `"robotsAllowed": false`
  are left out, and the list is empty while the site is hidden from search.

## How a push is published

- Each push to the publishing branch is published as one **release**: every
  page plus the header, footer and theme, together with that commit's docs.
- Validation is all-or-nothing. If any file is invalid, or a header or footer
  link points to a page that doesn't exist, nothing changes on the live site
  and the problems (file, JSON pointer, message) show in the repository dialog.
  Missing descriptions, long titles and broken links inside pages are warnings.
- A push that doesn't touch the pages folder, `site.json` or the docs folder
  publishes nothing.
- **Website → Releases** lists releases; activate an older one to roll back.
- Pull requests that change pages get a **FrontLit / pages preview** check
  linking to a private, unindexed preview of the result.

## Formatting

FrontLit writes files in one canonical form, so diffs stay small: keys in
schema order, settings equal to a default left out, 2-space indent and a
trailing newline. Files you write by hand don't have to match it.

## For coding agents

Install the `frontlit-pages` skill. It teaches agents the blocks, copy and SEO
rules and validates pages before they open a pull request:

```bash
npx skills add codelitdev/frontlit-skills --skill frontlit-pages
```

Or add this to your repository's `AGENTS.md` (or `CLAUDE.md`):

```md
## FrontLit pages

Marketing pages live in `frontlit/pages/*.json` and publish on merge.
- File name = URL (`pricing.json` → `/pricing`, `index.json` → `/`). Flat folder only.
- Every file starts with `"$schema": "https://frontlit.app/schema/page.v1.json"`;
  validate against it before committing. `frontlit/site.json` (schema
  `site.v1.json`) holds the header, footer, theme, redirects and agent instructions.
- A page is `{ title, description, layout: [{ name, settings? }] }`. Only set
  settings that differ from the block defaults listed in the schema.
- Rich text is Markdown. Media is `{ "url", "alt" }` with an `https://` URL or
  a repo-relative image path; repo images are uploaded on sync.
- One H1 per page (the hero); other block titles are H2.
- Don't add a header or footer to pages — they come from `site.json`.
- Header and footer links must point at existing pages, or the release fails.
```
