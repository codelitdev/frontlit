# FrontLit Changelog Management — Implementation Plan

Status: implemented (2026-11-07).
Scope: authoring, publishing, and delivering product updates (internal kind `changelog`, contract name `productUpdates`, public route `/changelog`).

## 1. Decisions

1. **The editor and API/MCP are the only authoring path.** Entries are drafted in the dashboard editor or created as drafts by an agent through MCP, then published by a person. FrontLit does not integrate with GitHub for changelogs.
2. **Automation lives on the customer's side.** A team's coding agent (Claude Code, Cursor, …) already has `git log`, `gh`, and the PRs. With FrontLit's MCP server connected, it drafts entries using the existing `create_product_update` tool. FrontLit needs no webhooks, LLM pipeline, or repository access for this.
3. **Keep the existing model.** An entry is a `documents` row (`kind: "changelog"`) with a title, body, and optional `releaseDate`. There is no separate version field or change-type labels: they repeated the title and body and could disagree with them. Versioned products put the version in the title (`v1.2.0` or `v1.2.0: Dark mode`), as Claude Code and Keep a Changelog headings do, and group changes in the body under `### Added`, `### Fixed`, and so on. Draft/publish, slugs, AI indexing, and MCP are unchanged.
4. **Follow [Keep a Changelog](https://keepachangelog.com/) where it is cheap.** Newest first, each entry dated and linkable, and change types as `###` headings in the body. The body structure is not enforced.
5. **One public page.** Each entry has an anchor at `/changelog#<slug>` (as Mintlify does). There are no pages for individual entries.

### Why GitHub is removed

- Most FrontLit customers deploy continuously and do not cut GitHub Releases, so syncing Releases would do nothing for them. FrontLit itself has none (`createGithubReleases: false` in `.github/workflows/publish-packages.yaml`).
- There is little evidence of demand for hosted pages generated from `CHANGELOG.md`. Mintlify, Fern, and ReadMe do not parse it.
- The current import stores a GitHub personal access token per team. Deleting it removes stored secrets and an outbound API path.

### Non-goals

- GitHub Releases sync, `CHANGELOG.md` or folder sources, or a Mintlify importer
- Pages for individual entries, Open Graph images, or pagination of the public page
- Label or tag filters on the public page
- Email notifications, an in-app "What's new" widget, or scheduled publishing
- Enforcing Keep a Changelog body structure (sections, Unreleased)

Each can be added later without reworking this design.

## 2. Current state and problems

| # | Problem | Where |
|---|---|---|
| P1 | Every RSS item uses `/changelog` as both its link and its guid, so feed readers that use the guid as identity dedupe or misshow items. Items also have no body: `description` is `excerpt`, which changelog entries do not set. | `apps/sites/app/sites/[teamId]/(site)/changelog/rss.xml/route.ts` |
| P2 | JSON-LD `ItemList` entries all point to `/changelog`. | `apps/sites/components/content-feed.tsx` |
| P3 | Entries render with no `id`, so `publicContentPath("changelog", slug)` (`/changelog#slug`) used in AI citations links to an anchor that does not exist. | `apps/sites/components/themed-content-feed.tsx`, `packages/api-contract/src/content-paths.ts` |
| P4 | Changelog chunks set `anchor = slugify(heading)` (e.g. `fixed`). `publicContentPath` prefers that over the slug, so citations point to `#fixed`. | `apps/api/src/documentation/chunking.ts:126` |
| P5 | Chunks have no release context, so the bot can present an old fix as current. | `apps/api/src/documentation/chunking.ts`, index job |
| P6 | The feed displays and sorts by `publishedAt` and ignores `releaseDate`. | `themed-content-feed.tsx`, `listPublishedDocuments` in `apps/api/src/documents/queries.ts` |
| P7 | The feed shows at most 100 entries (RSS 50), so older entries, and their anchors, disappear. | `content-feed.tsx` |
| P8 | `releaseDate` and `labels` accept any string, with no format or length limits. The editor offers `added/fixed/improved/removed`, while the import wrote `prerelease`. | `packages/api-contract/src/schemas/product-updates.ts` |
| P9 | The public product-updates list has no `publicReadLimiter` and no upper bound on `itemsPerPage`. Other public reads in the same router use the limiter. | `apps/api/src/public/routes.ts` (`listProductUpdates`) |
| P10 | The GitHub import (personal access token, `listReleases`, `markdownToTipTap`) is spread across REST, MCP, the dashboard, the policy maps, and the `integrations` provider enum. | see §3.2 |

## 3. Work packages

Two PRs, followed by docs and dogfooding. Each PR must pass a full browser smoke test before it is considered done (AGENTS.md).

### 3.1 PR 1 — Correct public changelog

**Contract (`packages/api-contract`)**

- `productUpdateMetaSchema`:
  - `releaseDate`: `YYYY-MM-DD` only (regex), optional.
  - Remove `labels`: entry-level badges repeated the body's `### Added` / `### Fixed` sections and were only displayed, never filtered on.
  - Remove `version`: it duplicated the title and could disagree with it.
  - Remove `github`.
- Public list query for product updates: `itemsPerPage` `max(1000)`.
- Add a shared helper `changelogDate(entry)` that returns `meta.releaseDate ?? publishedAt` as `YYYY-MM-DD`. Every surface uses it so they all show the same date.
- Change `publicContentPath("changelog", slug, anchor)` to **ignore `anchor`** and always return `/changelog#<slug>`. Entries are the only linkable unit.

**API (`apps/api`)**

- `listPublishedDocuments("changelog")`: order by `coalesce(meta->>'releaseDate', to_char(published_at, 'YYYY-MM-DD')) desc, published_at desc`. Use the published `meta`, never `draftMeta`. Leave other kinds unchanged.
- `listProductUpdates` public route: add `publicReadLimiter` to match the other public reads.
- Chunking for `kind === "changelog"`:
  - `anchor = null`, since citations fall back to `#slug`.
  - Prefix each chunk with `"<title> — <date>"` so it carries release context. The index job passes the document's title and meta, because `extractChunks` sees only the content.
- Migration (pre-production, so rewrite it): drop `meta.labels`, `meta.version`, and `meta.github` from existing changelog rows and reduce `releaseDate` to `YYYY-MM-DD`, in both `meta` and `draftMeta`.

**Sites (`apps/sites`)**

- `ThemedProductUpdatesFeed`:
  - `id={slug}` on each `<li>`, with `scroll-margin-top` for the sticky header.
  - The entry title (`Header4`) is its permalink: an in-page `<a href="#<slug>">` with a decorative link icon on hover, the GitHub/Mintlify heading-anchor convention. No clipboard button, so the feed stays a server component.
  - Show `changelogDate`. Format date-only strings in UTC, otherwise `2026-11-07` shows as Nov 6 in US time zones.
  - All visible elements stay page-builder primitives.
- Fetch all entries (`itemsPerPage: 1000`) for the feed, Markdown output, and JSON-LD. RSS keeps the newest 50.
- RSS items:
  - `link`/`guid`: `https://<host>/changelog#<slug>`
  - `pubDate`: `changelogDate`
  - `description`: `excerpt` if set, otherwise the first ~300 characters of plain text from the TipTap body (escaped by the existing `escapeXml`)
- JSON-LD: each entry's `url` becomes its anchor URL.
- Markdown (`changelogFeed` in `apps/sites/lib/markdown.ts`): same ordering, `changelogDate`, and a heading of `## <title> (<date>)`.

**Dashboard (`apps/web`)**

- Product-update editor:
  - Remove the version field and the change-type toggles.
  - `releaseDate` uses a date input, with a hint that it defaults to the publish date when empty.
  - Show the public anchor URL ("View on site") for published entries.

### 3.2 PR 2 — Remove the GitHub import

The changelog import and the docs/pages GitHub feature are **separate systems that share only the word "GitHub"**. PR 2 deletes the changelog import and must leave docs/pages GitHub unchanged.

#### How the two systems differ (verified 2026-11-07)

| | Docs/pages GitHub (KEEP) | Changelog GitHub import (DELETE) |
|---|---|---|
| Auth | GitHub App installations (`apps/api/src/documentation/github/app.ts`) | Personal access token per team |
| Storage | `documentation_git_*` tables (`documentationGitBindings`, `…Setups`, `…Grants`, `…Jobs`, …) and `gitAssets` | One `integrations` row with `provider = 'github'` (encrypted token and repo) |
| API code | `apps/api/src/documentation/github/*`, mounted in `app.ts` as `docsGitHubRoutes` and `docsGitHubWebhooks` | `apps/api/src/integrations/github.ts`; GitHub helpers in `apps/api/src/integrations/queries.ts`; four handlers in `apps/api/src/documents/changelogs-routes.ts` |
| HTTP routes | `/integrations/github/callback`, `/integrations/github/webhook` (and `/docs/` variants) | `/content/product-updates/github*`, `/content/product-updates/import-github` |
| Contract | `contract.content.documentationGithub` | `contract.content.productUpdates.{connectGithub, getGithubIntegration, disconnectGithub, importGithubReleases}` |
| MCP tools | `*_documentation_github*` (`apps/api/src/mcp/tools/documentation-github.ts`) | `connect_github_product_updates`, `get_github_product_updates_integration`, `disconnect_github_product_updates`, `import_github_releases` |
| Web | Settings → Integrations (reads `getDocumentationGitSource`), `documentation-source.tsx`, `documentation-proposals.tsx`, the `documentationGithub` client functions in `apps/web/lib/api.ts` | The GitHub card in `product-updates-view.tsx`; `getGithubIntegration`, `connectGithubIntegration`, `disconnectGithubIntegration`, `importGithubReleases`, `GithubIntegration` in `apps/web/lib/api.ts` |

Checked: no docs/pages code imports `apps/api/src/integrations/github.ts` or the GitHub helpers in `integrations/queries.ts`. The Settings → Integrations "GitHub" row reflects the docs/pages connection, not the changelog token.

#### Delete

- **Contract:** the four `productUpdates` GitHub endpoints, `githubIntegrationConfigSchema`, `githubIntegrationSchema`, `importGithubReleasesResponseSchema`, and `github` in `productUpdateMetaSchema`.
- **REST:** the four handlers and their authorization entries in `apps/api/src/documents/changelogs-routes.ts`. Drop the route-order comment, which only existed for the literal GitHub routes.
- **MCP:** the four tools in `apps/api/src/mcp/tools/changelogs.ts`. Remove their scope entries (`apps/api/src/mcp/policy.ts:145-148`) and `import_github_releases` from the confirmation list (`policy.ts:241`), and update `apps/api/src/mcp/server.test.ts`.
- **Operation policy:** the four `content.productUpdates.*Github*` entries in `apps/api/src/auth/operation-policy.ts`.
- **Queries:**
  - `findChangelogByGithubReleaseId` in `apps/api/src/documents/queries.ts`.
  - The GitHub functions in `apps/api/src/integrations/queries.ts` (`getGithubIntegration`, `upsertGithubIntegration`, and `deleteIntegration` if only these callers use it). Keep the SendLit functions and the generic helpers they use.
- **`apps/api/src/integrations/github.ts`** (`listReleases`, `markdownToTipTap`): delete it. Its only consumers are the two changelog files above.
- **Schema and migration:** remove `"github"` from `integrationProviders`, keeping `"sendlit"`, and fix the outdated comment above it. The migration runs only `DELETE FROM integrations WHERE provider = 'github'`. It must not touch any `documentation_git_*` table, `git_assets`, or `sendlit` rows.
- **Web:** the GitHub card and its state in `product-updates-view.tsx`, and the five changelog-specific exports in `apps/web/lib/api.ts`. Leave every `documentationGithub` function and the page-sync `git*` fields untouched.
- **OpenAPI and docs:** remove the product-update GitHub operations from `apps/api/src/openapi.ts`. Update `docs/architecture.md` §8 and its API/MCP tables, and change the "changelog with GitHub…" wording in the README and architecture doc.

#### Do not touch

- `apps/api/src/documentation/github/**`, `apps/api/src/pages/git-import.ts`, `apps/api/src/pages/releases.ts`
- `/integrations/github/*` routes (same prefix as the deleted file's directory name, but they are the docs App's routes)
- `apps/api/src/mcp/tools/documentation-github.ts` and the `*_documentation_github*` policy entries
- Settings → Integrations (`?tab=github`), `documentation-source.tsx`, `documentation-proposals.tsx`
- The `integrations` table and SendLit key storage

**Naming trap.** `apps/api/src/integrations/github.ts` (delete) and the `/integrations/github/*` routes (keep) look related but are not. Delete files and symbols by exact name, not by searching for "github".

#### Safety checks for PR 2

- **Before deleting:** run `rg -n "integrations/github|getGithubIntegration|upsertGithubIntegration|listReleases|markdownToTipTap|findChangelogByGithubReleaseId"`. The only hits should be the files listed under Delete. If anything else matches, stop and reassess.
- **Test suites:** the full API suite, including `apps/api/src/documentation/github/*.test.ts` (setup, webhooks, source, migrations, transports, OAuth), plus `apps/api/scripts/test-docs-postgres.ts` against a real database. All must pass with no changes to those test files.
- **Typecheck and lint** across `apps/api`, `apps/web`, `apps/sites`, and `packages/api-contract`. This catches any remaining caller of removed contract routes.
- **Migration test:** seed one `github` and one `sendlit` `integrations` row plus a docs Git binding. After migrating, only the `github` row is gone.
- **Browser smoke test (docs/pages GitHub must still work):**
  1. Settings → Integrations shows the GitHub row with the correct connected state for a docs-connected team.
  2. Push a docs change to the connected test repo (`rajat1saxena/docs-site` for the `hathi` team). The webhook delivers, sync runs, and the change appears on `/docs`.
  3. If pages sync is enabled, edit a page file and confirm it publishes.
  4. Product updates shows no GitHub card. Creating, editing, and publishing an entry still works.

### 3.3 Agent recipe and dogfooding

- Add a short user-facing guide, "Write your changelog with your coding agent":
  - connect the FrontLit MCP server with product-updates read and write scopes;
  - a sample prompt (below);
  - then review and publish in the editor.
- Publish the guide on FrontLit's own docs.
- Dogfooding: the FrontLit team writes its product changelog in the editor, or with Claude Code through MCP, and publishes it to FrontLit's own `/changelog`.

Sample prompt:

> List the PRs merged to `main` since the last published FrontLit changelog entry. Skip chores, refactors, CI, and dependency bumps. Draft one product update with a short title, a one-sentence intro, and bullets grouped under `### Added` / `### Changed` / `### Fixed` headings, written for customers, not engineers. Create it as a draft with `create_product_update` and do not publish it.

## 4. Security

- **Fewer secrets and less outbound access.** PR 2 deletes the changelog's stored GitHub tokens and the code that calls `api.github.com` with them. The migration purges only `integrations` rows with `provider = 'github'`. Docs/pages GitHub App credentials and bindings live in separate tables and are not affected (§3.2).
- **Public read limits.** Add `publicReadLimiter` to the public product-updates list, and cap `itemsPerPage` at 1000. Edge caching (`changelog:<team>` tag) already absorbs most traffic.
- **No draft leakage.** Public list, RSS, JSON-LD, Markdown, and AI indexing read only published columns (`content`, `meta`, `publishedAt`) and filter on `publishedAt IS NOT NULL`. The new sort must use `meta`, not `draftMeta`. Add a test that a draft-only `releaseDate`/label change does not affect public order or output.
- **Input validation.** `releaseDate` uses a strict format; unknown meta keys are rejected by MCP and stripped by REST. Slugs are already normalized (`normalizeEditableSlug`) and URL-encoded in `publicContentPath`.
- **Output encoding.** React escapes anchor ids and titles. RSS keeps `escapeXml` for every field, including the new plain-text description. No raw HTML is added.
- **Agent drafts are untrusted input.** PR titles and descriptions the agent summarizes may contain injected instructions. The recipe creates **drafts only**, and a person publishes. This is a convention, not enforced: `publish` uses the same `productUpdatesWrite` scope as `create` (`apps/api/src/auth/operation-policy.ts`). Splitting out a publish scope is deferred until a team asks for it.
- **Authorization unchanged.** Remaining endpoints keep their `content.productUpdates.*` permissions. Removed operations disappear from both the REST and MCP policy maps in the same PR, so no orphaned permission remains.

## 5. Maintainability

- **One definition per concept.**
  - `publicContentPath` is the only builder of changelog URLs, used by the feed, RSS, JSON-LD, sitemap, and citations.
  - `changelogDate` is the only date rule.
  - `listPublishedDocuments` holds the only sort.
- **Remove code rather than disable it.** The GitHub import is deleted end to end, not hidden behind a flag. With fewer endpoints, MCP tools, and policies, there's less to keep consistent.
- **No new tables, workers, or integrations.** Changelog stays a thin kind on the shared documents engine.
- **Docs move with the code.** PR 2 updates `docs/architecture.md` §8, its API/MCP tables, and the README. This file records the decisions so the GitHub question is not reopened without new evidence.

## 6. Testing

**Unit and integration (`apps/api`, `packages/api-contract`)**

- Meta schema: valid and invalid `releaseDate`; no `version` or `labels` fields.
- `changelogDate`: `releaseDate` wins, falls back to `publishedAt`, and is formatted in UTC.
- `publicContentPath("changelog", slug, "fixed")` returns `/changelog#<slug>`.
- `listPublishedDocuments("changelog")`: ordered by release date, then `publishedAt`; ignores `draftMeta`; excludes unpublished entries.
- Chunking: changelog chunks have `anchor: null` and a release-context prefix. Doc and blog chunks are unchanged.
- Public route: rejects `itemsPerPage` > 1000; rate limiter attached.
- PR 2: the contract, REST router, MCP tool list, and policy maps contain no GitHub product-update operations. The migration removes `github` integration rows and leaves `sendlit` rows.

**Sites (`apps/sites`)**

- RSS: unique `guid` per item equal to its anchor URL; `pubDate` from `changelogDate`; description escaped.
- JSON-LD: anchor URL for each entry.
- Markdown: ordering and date match the HTML feed.

**Browser smoke test (required)**

1. Create a draft through MCP (`create_product_update`) with a `releaseDate` in the past. Confirm it does not appear on `/changelog`, in `/changelog/rss.xml`, or in `/changelog.md`.
2. Edit it in the dashboard (date input) and publish.
3. On `/changelog`:
   - the entry sits at the correct position by release date;
   - its date is not shifted by time zone;
   - clicking an entry title sets the URL to `/changelog#<slug>`;
   - opening that URL scrolls to the entry below the sticky header.
4. RSS shows the item with its anchor link. A feed validator reports unique GUIDs.
5. With changelog indexing enabled, ask the site chatbot about the change. Confirm the citation links to `/changelog#<slug>` and the answer names the release title and date.
6. Confirm the dashboard has no GitHub card on product updates, and that the docs GitHub connection in Settings → Integrations still works.

## 7. Delivery order

1. **PR 1:** correct public changelog (§3.1). This fixes P1–P9.
2. **PR 2:** remove the GitHub import (§3.2). This fixes P10. It can be developed in parallel with PR 1; merge it second to keep migrations ordered.
3. **Agent recipe and dogfooding** (§3.3): the guide, plus FrontLit's first entries on its own `/changelog`.

## 8. Revisit when

- **A paying customer with a versioned product asks for automatic sync:** add GitHub Releases sync through the existing GitHub App, with GitHub-owned entries read-only. Do not bring back personal access tokens.
- **Changelogs grow past a few hundred entries:** add change-type filters derived from the body's `###` headings and split the history into yearly archives (see the scale limits below).

### Known scale limits

`/changelog` is not paginated: it renders up to `CHANGELOG_PAGE_SIZE` (1,000, the public API's max page size) entries on one page, cached until the next publish. RSS always shows the newest 50.

- **A few hundred entries:** the page grows heavy, because every entry's full body is in the HTML. This is the first limit a real team would notice.
- **Over 1,000 entries:** older entries **silently drop off** the page and `/changelog.md`, and their `#slug` links stop resolving. There is no warning.
- **Very large histories:** each cache miss sorts all of a team's published entries, because the `releaseDate ?? publishedAt` order has no matching index. Caching keeps this off the visitor path.

When a team approaches a few hundred entries, move to yearly archives: `/changelog` shows the latest year (or latest N), older entries live at `/changelog/<year>` with the same anchors, and a small script on `/changelog` redirects old `#slug` links to their year page. Add an index on the release-date ordering only if the sort shows up as slow.
- **Teams ask to share individual launches:** add `/changelog/<slug>` pages with Open Graph images. Anchors remain valid.
