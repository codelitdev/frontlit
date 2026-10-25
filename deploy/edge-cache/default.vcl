vcl 4.1;

# Optional edge cache for FrontLit public sites (docs/site-delivery.md §5).
#
#   visitor → Caddy (TLS) → Varnish (this file) → frontlit-sites
#
# Run apps/sites with EDGE_CACHE_MODE=purge (or ttl). Pages are kept for as
# long as FrontLit's CDN-Cache-Control says and dropped by tag when
# FrontLit purges them through purge-receiver.mjs (xkey). Remove this layer
# and everything still works: FrontLit caches pages itself.

import std;
import xkey;

backend sites {
    .host = "frontlit-sites";
    .port = "3002";
}

# Only the purge receiver may purge.
acl purgers {
    "localhost";
    "127.0.0.1";
    "::1";
    "172.16.0.0"/12;
    "10.0.0.0"/8;
    "192.168.0.0"/16;
}

sub vcl_recv {
    if (req.method == "PURGE") {
        if (client.ip !~ purgers) {
            return (synth(403, "Forbidden"));
        }
        set req.http.n-gone = xkey.purge(req.http.xkey-purge);
        return (synth(200, "Purged " + req.http.n-gone));
    }

    # Per-visitor routes and anything that isn't a plain read go straight
    # through. FrontLit marks them private anyway.
    if (req.method != "GET" && req.method != "HEAD") {
        return (pass);
    }
    if (req.url ~ "^/(help/tickets/|_preview/|embed/chat(\?|$)|api/)") {
        return (pass);
    }

    # Public pages are the same for every visitor; cookies (analytics, the
    # color-mode script) must not split the cache.
    unset req.http.Cookie;
    unset req.http.Authorization;

    # The cache key is host + full URL, query string included: client-side
    # navigations fetch RSC payloads from the same path with `_rsc=…`, and
    # they must never be confused with the HTML.
    return (hash);
}

sub vcl_backend_response {
    # Index the page by its FrontLit tags for xkey purges.
    if (beresp.http.Surrogate-Key) {
        set beresp.http.xkey = beresp.http.Surrogate-Key;
    }

    if (beresp.status >= 500 || beresp.http.Set-Cookie ||
        beresp.http.Cache-Control ~ "(private|no-store)" ||
        beresp.http.CDN-Cache-Control !~ "s-maxage=\d+") {
        # Errors and private responses are never stored; a stored copy is
        # served instead while the origin fails (grace below).
        set beresp.uncacheable = true;
        set beresp.ttl = 0s;
        return (deliver);
    }

    # CDN-Cache-Control (RFC 9213) is meant for this cache; the browser's
    # Cache-Control (max-age=0) stays untouched for the visitor.
    set beresp.ttl = std.duration(
        regsub(beresp.http.CDN-Cache-Control, ".*s-maxage=(\d+).*", "\1s"), 0s);
    # Past the TTL, a stored copy is served while Varnish refetches it, or
    # while the origin is failing (stale-while-revalidate / stale-if-error).
    set beresp.grace = 7d;
    return (deliver);
}

sub vcl_deliver {
    unset resp.http.xkey;
    if (obj.hits > 0) {
        set resp.http.X-Edge-Cache = "HIT";
    } else {
        set resp.http.X-Edge-Cache = "MISS";
    }
}
