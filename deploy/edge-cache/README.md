# Optional edge cache (Varnish)

FrontLit caches public pages itself and refreshes them on publish. You
don't need this. Add it when you want a second cache in front of
`frontlit-sites`: to absorb traffic spikes, or to serve pages while the
origin is down. Design: [`docs/site-delivery.md`](../../docs/site-delivery.md) §5.

```
visitor → Caddy (TLS, unchanged) → Varnish → frontlit-sites
                                      ↑
                 frontlit-api → edge-purge (purge-receiver.mjs)
```

## Run it

1. Set a secret shared by the API and the purge receiver in `.env`:

   ```
   EDGE_PURGE_SECRET=<openssl rand -base64 48>
   ```

2. Start the stack with the override file:

   ```sh
   docker compose -f docker-compose.yml -f deploy/edge-cache/docker-compose.edge.yml up -d
   ```

   It sets `EDGE_CACHE_MODE=purge` on `frontlit-sites`, points
   `frontlit-api` at the purge receiver, and starts Varnish on
   `${EDGE_PORT:-8080}`.

3. Point Caddy at Varnish instead of the sites container, keeping on-demand
   TLS as it is:

   ```
   https:// {
       tls { on_demand }
       reverse_proxy varnish:80
   }
   ```

Check it: `curl -sI https://<your site>/ | grep -i x-edge-cache` shows
`MISS`, then `HIT`.

## What it does

- **Caches** each public page under host + full URL. The query string is
  part of the key, which keeps Next.js RSC payloads (`?_rsc=…`) apart from
  the HTML. Cookies are ignored for public pages.
- **Never caches** ticket threads, pull request previews, the chat embed,
  non-GET requests, 5xx responses or anything FrontLit marks private.
- **Purges by tag.** Each page carries its FrontLit tags in `Surrogate-Key`
  (`team:…`, `shell:…`, `page:…`, `docs:…`, `blog:…`, `changelog:…`,
  `sitemap:…`). When content changes, the API purges the same tags it
  expires in its own cache. It purges once after the origin acknowledged and
  again ten seconds later. A failed purge is retried until it succeeds.
- **Serves stale on errors** for up to 7 days (`grace`).

## Without a purge integration

Set `EDGE_CACHE_MODE=ttl` (and optionally `EDGE_CACHE_TTL`, default 60
seconds) instead of `purge`. Any CDN or caching proxy then keeps pages for
at most that long; no receiver or API settings are needed.

## Another cache or CDN

The API's `http` purge adapter sends a signed `POST { teamId, tags }`;
see `purge-receiver.mjs` for verifying it. Anything that can purge by tag
(Fastly surrogate keys, Cloudflare cache tags, nginx with a purge module)
works with a receiver of a few lines. The cache must include the query
string in its key.
