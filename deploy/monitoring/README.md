# Monitoring the public sites

`apps/api` exposes Prometheus metrics at `/metrics` (keep it on a private
network). For the public sites it reports:

| Metric | What it is |
| --- | --- |
| `site_web_vital{metric,route,cache}` | Histogram of real visitors' Core Web Vitals (`TTFB`, `FCP`, `LCP`, `INP` in seconds; `CLS` unitless), by route kind (`page`, `docs`, `blog`, `changelog`) and edge cache status |
| `site_page_loads_total{route,cache}` | Page loads by edge cache status (`HIT`, `MISS`, or `unknown` without an edge cache) |
| `site_cache_invalidations_pending` | Cache invalidations (site and edge) not yet delivered everywhere |
| `site_cache_invalidations_oldest_age_seconds` | Age of the oldest of them |

Visitors' browsers send the vitals to `POST /rum` on the API once per page
view: no cookies, no identifiers, no URL. Set `SITE_RUM=off` on
`apps/sites` to turn it off.

The edge cache status comes from a `Server-Timing` entry named `edge` (the
Varnish recipe in `deploy/edge-cache` adds it) or `cfCacheStatus`.

Import [`grafana-public-sites.json`](grafana-public-sites.json) into Grafana
for the targets in `docs/site-delivery.md` §9: edge hit ratio, TTFB p75 on
hits, LCP, INP and CLS p75 by route, and pending invalidations.

Useful queries:

```promql
# Edge hit ratio
sum(rate(site_page_loads_total{cache="HIT"}[5m]))
  / sum(rate(site_page_loads_total{cache=~"HIT|MISS"}[5m]))

# LCP p75 for docs
histogram_quantile(0.75, sum by (le) (rate(site_web_vital_bucket{metric="LCP",route="docs"}[5m])))
```

Counts live in the API process and reset when it restarts; with several
API replicas, scrape each one and sum.
