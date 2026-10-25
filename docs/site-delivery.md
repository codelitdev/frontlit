# Public site delivery & performance

Scope: how `apps/sites` serves tenant websites, docs, blog and changelog
fast: caching, invalidation, optional CDN support and page weight.
Tracking issue: [#75](https://github.com/codelitdev/frontlit/issues/75)
(phases [#71](https://github.com/codelitdev/frontlit/issues/71)–[#74](https://github.com/codelitdev/frontlit/issues/74)).

## 1. Principles

1. **Fast by default and self-hostable.** A single `docker compose up` on one
   machine must serve cached pages without a CDN, Redis or any vendor account.
2. **The cache lives inside FrontLit.** Correct, fresh delivery never depends
   on a CDN or a purge API. An HTTP cache or CDN in front is optional and
   vendor-neutral (§5).
3. **One rendering pipeline.** CMS-owned and Git-owned content both end up as
   a publication in Postgres and go through the same render, cache and
   invalidation path. There is no static-export or per-commit build.
4. **Every visitor gets the same HTML.** Public HTML has no per-visitor input:
   no cookies, no session, color mode applied client-side. A response depends
   only on host and path, so it is safe to share.
5. **Invalidate on publish; time-based refresh is only a safety net.**
6. **MediaLit stores media only.** It is not used to deliver site HTML.

## 2. Starting point (2026-10-17)

- Every request renders on demand: the tenant layout reads request headers
  (`x-frontlit-embed`, `x-frontlit-canonical-host`), so Next.js can't cache
  whole pages. The only cache is a 60-second fetch cache per pod
  (`teamCache` in `apps/sites/lib/api.ts`).
- Docs use `no-store` end to end (snapshot read and proxy header), so every
  docs view hits the API and database.
- `revalidateTag` and the host cache are per pod, so with several replicas
  one webhook clears only one replica's cache.
- `revalidateTeam` (`apps/api/src/services/revalidate.ts`) is a best-effort
  POST outside the outbox. It is acceptable only because of the 60-second
  ceiling.
- The page-builder renderer is entirely client code
  (`packages/page-builder/scripts/add-use-client.mjs` marks every built file
  `"use client"`), so every page ships and hydrates all blocks plus the
  layout JSON.
- Images are raw `<img>` tags pointing at full-size MediaLit originals, and
  `images.remotePatterns` allows any host.

## 3. Request flow (target)

```
visitor
  → [optional] CDN / HTTP cache (Layer 2, §5)
  → Caddy (on-demand TLS, unchanged)
  → apps/sites proxy.ts: host → teamId (cached), rewrite to /sites/[teamId]/…
  → rendered-page cache (Layer 1, §4) ── hit → response
        └─ miss → render using cached shell data + cached content data
                    └─ data miss → apps/api /public/* → Postgres
media → MediaLit URLs (or the image optimizer, §6.3)
```

## 4. Layer 1: built-in cache (always on)

### 4.1 Mechanism

Use Next.js Cache Components (`cacheComponents: true`) with `"use cache"`
public data functions and route segments, `cacheTag` for invalidation and
`cacheLife` for safety-net lifetimes. All public reads in
`apps/sites/lib/api.ts` become cached functions; the fixed 60-second
`teamCache` goes away.

| Deployment        | Cache storage                                                       | Required        |
| ----------------- | ------------------------------------------------------------------- | --------------- |
| Single container  | Next's default in-memory/disk handler                               | nothing         |
| Several replicas  | Redis handler registered under `cacheHandlers`; `refreshTags()` makes invalidation reach every replica | `REDIS_URL`     |

The handler is `apps/sites/cache-handler.cjs`, registered for both `"use
cache"` and `"use cache: remote"`. Without `REDIS_URL` it is Next's default
in-memory handler. With `REDIS_URL`:

- Entries live in process memory and in Redis. A replica that misses in
  memory reads Redis before it calls the API, so a new replica serves
  already-rendered data without touching the API.
- `revalidateTag` writes the tag's timestamps to Redis and publishes them.
  Every replica applies them at once to Next's process-wide tag manifest.
  Full-page cache hits are checked against that manifest, and `refreshTags()`
  only runs when a render calls a cached function, so a subscription is
  what makes a page that's served straight from the cache refresh on every
  replica. `refreshTags()` and every reconnect re-read Redis in case a
  message was missed.
- Redis never fails a request. Commands time out after 500 ms, aren't
  queued while disconnected, and the cache falls back to memory. A replica
  that boots without Redis connects in the background.

Without `REVALIDATE_WEBHOOK_SECRET` nothing can invalidate the cache, so
public reads use the `siteUnmanaged` profile (refresh every minute) instead
of `site`.

Multi-replica deployments also need the same `DEPLOYMENT_ID` on every
instance of a release (it becomes `deploymentId`). The public site has no
Server Actions, so it needs no shared encryption key.

### 4.2 Making routes cacheable

Nothing rendered under `/sites/[teamId]` may read request headers or
cookies, except the routes that stay uncached (§4.6).

- **Embed:** move `/embed/*` into its own route group with its own layout
  instead of the `x-frontlit-embed` header. The site layout (code injection,
  chat widget) never wraps embed routes.
- **Canonical host:** add `canonicalHost` to `GET /public/:teamId/settings`
  and read it from the cached settings, replacing `x-frontlit-canonical-host`
  and `lib/request-host.ts`.
- **Team and theme:** render code takes `teamId` from route params; nothing
  reads `x-frontlit-team-id`.
- **Search visibility:** a hidden site (`hideFromSearch`, also in public
  settings) is noindex in its HTML. A non-canonical host that still serves
  gets `X-Robots-Tag: noindex` from the proxy, so the HTML itself doesn't
  depend on the host.
- `proxy.ts` keeps host resolution and the rewrite. It may still add
  headers to the *response* (§5), but render code doesn't depend on
  request headers.
- **Build:** teams aren't known at build time. Every dynamic segment's
  `generateStaticParams` returns the `_build` placeholder, which Cache
  Components requires and which never calls the API. Real teams and paths
  render on first request and are cached from then on.

### 4.3 Cache tags

Shell data changes rarely and content changes often, so they are tagged
separately. A content publish re-renders pages using shell data that is
still cached; a branding change re-renders pages using content data that is
still cached.

| Tag                       | Attached to                                                                   |
| ------------------------- | ----------------------------------------------------------------------------- |
| `team:<team>`             | every cached entry of the team (domain changes, emergency flush)              |
| `shell:<team>`            | settings (title, logo, theme, code injection), chatbot settings, and every page read, because the API hydrates the published header/footer (`sharedWidgets`) into each page |
| `page:<team>:<slug>`      | one page-builder page by slug (`""` = homepage). System pages that frame built-in routes (`docs`, `blog`, `changelog`, `help`) use the same tag |
| `docs:<team>`             | docs snapshot: every docs article, navigation, collections                    |
| `blog:<team>`             | blog index, posts, `blog/rss.xml`                                             |
| `changelog:<team>`        | changelog feed, `changelog/rss.xml`                                           |
| `sitemap:<team>`          | `sitemap.xml`                                                                 |

`<team>` is the public team ID. Rendered routes inherit the tags of the
cached data they read, so a page tag never has to be computed separately.

Docs articles, blog posts and other routes that wrap their own content
only need the shared header and footer. They read them through
`getSiteChrome()`, cached under `shell:<team>` alone, so publishing the
homepage doesn't re-render them.

### 4.4 Lifetimes

Each tagged entry uses one `cacheLife` profile, `site`: stale after 1 hour,
revalidated in the background, expired after 30 days. The hour only bounds
staleness if an invalidation is lost (§4.5); normal freshness comes from tags.
`robots.txt`, `favicon.ico` and OG images use the same profile under
`shell:<team>`.

### 4.5 Invalidation

All invalidations go through the Postgres outbox (§10.5 of
`architecture.md`) to the signed sites webhook, with retries and
per-destination acknowledgment. This replaces the best-effort
`revalidateTeam`, which is acceptable today only because of the 60-second
cache.

| Change (API module)                                                        | Tags invalidated                                                  |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Settings: branding, theme, code injection (`settings`)                     | `shell:<team>`                                                    |
| Chatbot settings (`chatbot`)                                               | `shell:<team>`                                                    |
| Page publish/unpublish/delete; slug change; Git release (`pages`)          | Computed when a release is activated, by diffing it with the previous one: `page:<team>:<slug>` for every page whose slug or revision changed (old and new slug), plus `sitemap:<team>`. `shell:<team>` when the site snapshot (header, footer, theme, redirects) changed |
| Blog post publish/unpublish/delete/slug (`documents`)                      | `blog:<team>`, `sitemap:<team>`                                   |
| Changelog entry publish/unpublish/delete (`documents`)                     | `changelog:<team>`, `sitemap:<team>`                              |
| Docs activation / policy change / sensitive-data purge (`documentation`)   | `docs:<team>`, `sitemap:<team>`                                   |
| Domain verify/remove, subdomain visibility (`domains`)                     | `team:<team>` + `invalidateHosts`                                 |

The events are written in the query layer (`activateRelease`,
`updateTeamSettings`, `updateChatbotSettings`, the blog/changelog document
queries, domain changes), so REST, MCP and Git sync all invalidate the same
way. Page and release events are written in the transaction that changes
the content (`site_cache_outbox`). The API worker delivers them within a
second and retries with backoff. It posts to `SITES_REVALIDATE_URL`
(default `SITES_BASE_URL`), so a container setup can use the internal
service address. Queuing a docs publication wakes the publication worker
instead of waiting for its two-second poll.

Webhook contract: the existing `/api/webhooks/revalidate` payload becomes
`{ eventId, teamId, tags[], invalidateHosts? }`. Sites accepts only the tag
families above for that `teamId` (it is not an arbitrary purge endpoint),
calls `revalidateTag(tag, { expire: 0 })` for each, and keeps the
replay/receipt checks of `/api/webhooks/documentation`. The documentation
webhook keeps its event shape and maps every event type to
`docs:<team>` + `sitemap:<team>`, replacing today's whole-team tag.

The API reaches one sites replica (through the service). With the Redis
handler, that replica records the tag invalidation in Redis and the others
pick it up through `refreshTags()` before their next request.

### 4.6 Never cached

`/help/tickets/*` (magic-token thread with visitor PII), private dashboard
previews, chat and search API calls, form submissions and the webhook routes
stay dynamic. They keep reading request data and send
`Cache-Control: private, no-store`.

The ticket thread, pull request preview and `/embed/chat` read their token
or `?layout=` inside `<Suspense>`: the surrounding chrome comes from the
cache and the request-specific part renders per request. A missing or
wrong token therefore shows the not-found page with status 200 and
`noindex`, not 404. These pages are never indexed either way.

### 4.7 Host resolution

`hostCache` (`apps/sites/lib/host.ts`) keeps its short TTL and webhook
deletion. When `REDIS_URL` is set it is stored in Redis so `invalidateHosts`
reaches every replica. Concurrent misses for one host share a single
upstream call.

### 4.8 Failure behaviour

If the API or database is unavailable when an entry needs to be refreshed,
the stale entry keeps being served. Only a page that has never been cached
returns a 503. With Layer 2, `stale-if-error` extends this to the edge.

### 4.9 Docs consistency

Docs HTML is cached like any other page. The contract is in
`docs-management.md` §23.3; in short:

- Staleness is bounded by webhook delivery (normally under a second), with
  the hourly lifetime as the safety net if a delivery is lost.
- One response is rendered from one publication snapshot, so body,
  navigation and collections are always consistent.
- Search, chat answers and the public docs API stay authoritative and
  uncached; stale explicit identities still return `409 STALE_PUBLICATION`.

## 5. Layer 2: optional HTTP cache / CDN

FrontLit emits standard headers; any CDN or caching proxy can sit in front.
The mode is chosen with `EDGE_CACHE_MODE`.

| Mode             | Response headers on cacheable routes                                                                                     | Purge                               |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------- |
| `none` (default) | Next defaults                                                                                                            | none                                |
| `ttl`            | `CDN-Cache-Control: public, s-maxage=$EDGE_CACHE_TTL, stale-while-revalidate=86400, stale-if-error=604800`               | none; staleness capped at the TTL    |
| `purge`          | `CDN-Cache-Control: public, s-maxage=31536000, stale-while-revalidate=86400, stale-if-error=604800`, plus `Surrogate-Key` and `Cache-Tag` | outbox → purge adapter              |

In every mode the browser gets `Cache-Control: public, max-age=0,
must-revalidate`. Uncached routes (§4.6) always send `private, no-store`,
so they are never stored at the edge.

**Edge tags** are computed in `proxy.ts` from the URL path, so the edge
never needs page IDs. They use the same names as §4.3:

| Path                         | Edge tags                                     |
| ---------------------------- | --------------------------------------------- |
| any                          | `team:<team>`                                 |
| `/docs`, `/docs/*`           | `docs:<team>`                                 |
| `/blog`, `/blog/*`           | `blog:<team>`                                 |
| `/changelog`, `/changelog/*` | `changelog:<team>`                            |
| `/sitemap.xml`               | `sitemap:<team>`                              |
| other page paths             | `page:<team>:<slug>`                          |
| every HTML route             | `shell:<team>` (the shell is baked into every page) |

**Purge adapters.** The outbox gains an `edge` destination, used only in
`purge` mode, that calls `purge(tags[])` on the configured adapter:

- `http` (generic, first): a signed POST of `{ teamId, tags[] }` to
  `EDGE_PURGE_URL`, signed with `EDGE_PURGE_SECRET` using the existing
  webhook-signing scheme. Self-hosters connect any cache with a few lines
  of glue.
- Vendor adapters are added only when needed (hosted FrontLit, Phase 4).

**Order of operations** for every invalidation:

1. Layer 1 `revalidateTag`. It must be acknowledged before step 2, so the
   edge can't refill itself from a stale origin.
2. Edge purge.
3. A second edge purge about 10 seconds later, to catch renders that started
   before step 1 and finished after step 2.

A sensitive-data purge counts as complete only after the edge destination
acknowledges it.

**RSC payloads.** Client navigations fetch RSC payloads from the same paths
with an `_rsc` query parameter, and Next varies those responses on request
headers. The edge cache key must include the query string. Responses must
keep the `rsc`, `next-router-prefetch` and `_rsc` signals, so HTML and RSC
payloads are never mixed up (Next.js `cdn-caching` guide). Every Layer 2
setup must pass a client-navigation test behind the cache.

**Static assets.** `/_next/static/*` is content-hashed and already
`immutable`; any layer caches it. An optional `ASSET_PREFIX` serves it from a
separate host.

**Self-hosted recipe (optional, documented).** Caddy (TLS, unchanged) →
Varnish with the `xkey` module → `apps/sites`, with a small purge receiver
wired to the `http` adapter. It is not part of the default compose stack.

## 6. Page weight

These changes need no cache or CDN and are measured separately (Phase 1).

### 6.1 Server-rendered blocks

- Add a page-builder entry that works on the server, used by `apps/sites`.
  Static blocks render as server components; only interactive blocks (FAQ,
  marquee, email/support forms, theme mode switcher, docs search) are
  client components with their own `"use client"`.
- `scripts/add-use-client.mjs` skips that entry; the builder entry used by
  `apps/web` stays fully client.
- Theme resolution (`resolveSiteTheme`) moves to the server; the client
  wrapper `apps/sites/components/site-page-renderer.tsx` goes away.
- The layout JSON is no longer sent to the browser for static blocks.

### 6.2 Chat widget

The site layout renders only the launcher button. The panel and its
dependencies load when the browser is idle or on first interaction.

### 6.3 Images

- Render MediaLit images with `next/image` (built-in optimizer, self-host
  friendly), with explicit width/height, lazy loading below the fold and
  `fetchpriority="high"` on the LCP image.
- Restrict `images.remotePatterns` to the media host(s); `hostname: "**"`
  makes the optimizer an open image proxy.
- `IMAGE_LOADER` can switch to an external transform service (imgproxy or a
  CDN image service) without code changes.

### 6.4 Fonts and third-party code

- Fonts stay self-hosted with `preload: false`. Only the active theme's
  primary font gets a `<link rel="preload">`.

### 6.5 Prefetching

Public pages are fully cached, so `next/link`'s default viewport prefetch
would download every visible link's page, data and preloaded hero image (a
docs sidebar alone lists every article). Public-site links use `SiteLink`,
which prefetches on intent: hover, focus or touch.
- Tenant code injection never blocks rendering: injected scripts are
  deferred where possible.

## 7. Configuration (`apps/sites`)

| Variable                                | Default    | Purpose                                                |
| --------------------------------------- | ---------- | ------------------------------------------------------ |
| `REDIS_URL`                             | unset      | Shared Layer 1 cache and host cache; needed with several replicas |
| `DEPLOYMENT_ID`                         | unset      | Same value on every replica of one release (`deploymentId`) |
| `REVALIDATE_WEBHOOK_SECRET`             | unset      | Required for publish-time invalidation; unset = pages refresh every minute |
| `SITES_REVALIDATE_URL`                  | `SITES_BASE_URL` | Where apps/api posts invalidations (set on `apps/api`) |
| `EDGE_CACHE_MODE`                       | `none`     | `none` \| `ttl` \| `purge` (§5)                        |
| `EDGE_CACHE_TTL`                        | `60`       | `s-maxage` in `ttl` mode                               |
| `EDGE_PURGE_ADAPTER`                    | `http`     | Purge adapter in `purge` mode (set on `apps/api`)      |
| `EDGE_PURGE_URL`, `EDGE_PURGE_SECRET`   | unset      | Target of the `http` adapter (set on `apps/api`)       |
| `ASSET_PREFIX`                          | unset      | Separate host for `/_next/static`                      |
| `IMAGE_LOADER`                          | `default`  | `default` (built-in optimizer) or a loader URL template |

`SITES_BASE_URL` keeps its current meaning (links in emails).

## 8. Phases

| Phase | Issue | Scope | Depends on |
| ----- | ----- | ----- | ---------- |
| 1 | [#71](https://github.com/codelitdev/frontlit/issues/71) | Page weight (§6). Record a baseline first. | none |
| 2 | [#72](https://github.com/codelitdev/frontlit/issues/72) | Layer 1 (§4): cacheable routes, cache components, tags, outbox invalidation, Redis handler, docs cacheable | none; can run alongside Phase 1 |
| 3 | [#73](https://github.com/codelitdev/frontlit/issues/73) | Layer 2 (§5): header modes, `http` adapter, edge outbox destination, RSC test, Varnish recipe | Phase 2 |
| 4 | [#74](https://github.com/codelitdev/frontlit/issues/74) | Hosted FrontLit only: choose a CDN vendor, write its adapter, decide where custom-domain TLS lives, real-user monitoring | Phase 3 |

## 9. Targets and measurement

| Metric                                  | Target           |
| --------------------------------------- | ---------------- |
| Layer 1 hit ratio (cacheable routes)    | > 95%            |
| TTFB p75, cached, same region           | < 100 ms         |
| LCP p75                                 | < 1.5 s          |
| CLS p75                                 | < 0.1            |
| INP p75                                 | < 200 ms         |
| Publish → visible                       | < 2 s (Layer 1); < 15 s with edge purge |

Measure with Lighthouse CI on a sample tenant (home, docs article, blog
post), a Web Vitals beacon from public pages, and API metrics for public
read volume, which should fall sharply after Phase 2.

### 9.1 Measured (2026-10-25, local)

Sample tenant: a homepage with 9 blocks and 8 images, 12 docs articles, 7
blog posts and 3 changelog entries. One `next start` process; the API and
Postgres on the same machine. Lighthouse 13 runs mobile with simulated
throttling, median of 5. Load is autocannon with 10 connections for 15 s.
API calls are counted by a proxy between sites and the API.

| Measure                                   | Before Phase 2 (`main`) | Layer 1 cache |
| ----------------------------------------- | ----------------------- | ------------- |
| Throughput, home / docs article / blog post | 41 / 56 / 81 req/s      | 140 / 181 / 242 req/s |
| p50 under load, home / docs article        | 236 / 176 ms            | 63 / 50 ms    |
| Single-connection response, home / docs    | 22 / 26 ms              | 7 / 5 ms      |
| API calls per docs view                    | 1.0                     | 0             |
| Lighthouse TTFB, home / docs / blog        | 43 / 119 / 23 ms        | 17 / 10 / 7 ms |
| Publish → visible (page, blog, changelog)  | up to 60 s              | 0.18–0.35 s   |
| Publish → visible (docs publication)       | next request (no cache) | 0.43–0.54 s   |
| Second replica sees a publish (Redis)      | up to 60 s              | 0.33–0.48 s   |
| Cold replica's first 6 views (Redis)       | 12 API calls            | 0             |

Phase 1 (#71) against the commit before it, Lighthouse: performance score
55 → 91 (home), 73 → 93 (docs), 69 → 90 (blog post); TBT 1.1–1.3 s →
0.14–0.23 s; JavaScript 643 KB → 192 KB.
