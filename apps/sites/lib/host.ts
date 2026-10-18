import type { ResolvedHost } from "./api";

export type HostDecision =
  | { action: "unknown" }
  | { action: "redirect"; location: string }
  | { action: "rewrite"; teamId: string };

/**
 * Pure decision logic for the tenant-resolution middleware (architecture.md
 * §12.2): given what `resolve-host` returned for the request's `Host`
 * header, decide whether to pass through untouched (unknown host — let
 * Next's normal 404 handle it), permanently redirect to the canonical host
 * (the other half of an apex/www pair, or the FrontLit subdomain once a
 * custom domain is verified), or rewrite to the tenant's
 * `/sites/[teamId]/...` segment. The redirect keeps the path, query,
 * scheme and port of the request. Kept host-effect-free (no
 * `NextResponse`, no `fetch`) so it's unit-testable without a request.
 */
export function decideHost(
  resolved: ResolvedHost | null,
  requestUrl: { pathname: string; search: string; protocol: string; port: string },
): HostDecision {
  if (!resolved) return { action: "unknown" };
  if (resolved.redirect) {
    const port = requestUrl.port ? `:${requestUrl.port}` : "";
    return {
      action: "redirect",
      location: `${requestUrl.protocol}//${resolved.canonicalHost}${port}${requestUrl.pathname}${requestUrl.search}`,
    };
  }
  return { action: "rewrite", teamId: resolved.teamId };
}

/** Normalize a browser/edge Host header before using it as a cache key or
 * calling the API. In local development it is usually `slug.localhost:3002`. */
export function normalizeHost(value: string): string {
  const host = value.split(",")[0]?.trim().toLowerCase() || "";
  if (!host) return "";
  try {
    return new URL(`http://${host}`).hostname.replace(/\.$/, "");
  } catch {
    return host.replace(/:\d+$/, "").replace(/\.$/, "");
  }
}

type CacheEntry = { value: ResolvedHost | null; expiresAt: number };

/**
 * Short-TTL, in-memory cache for host resolution (architecture.md §12.2 —
 * "cached with a short TTL"). Module-level state persists across requests
 * within one server instance/edge isolate. Domain mutations delete listed
 * hosts via the revalidate webhook; the short TTL still bounds staleness
 * if the webhook is missed.
 */
export function createHostCache(ttlMs = 60_000) {
  const cache = new Map<string, CacheEntry>();
  return {
    get(host: string): ResolvedHost | null | undefined {
      const entry = cache.get(host);
      if (!entry || entry.expiresAt < Date.now()) return undefined;
      return entry.value;
    },
    set(host: string, value: ResolvedHost | null): void {
      cache.set(host, { value, expiresAt: Date.now() + ttlMs });
    },
    delete(host: string): void {
      cache.delete(host);
    },
  };
}

/** Process-wide cache used by `proxy.ts`. Domain mutations delete keys via
 * the revalidate webhook so hide/show does not leak for the TTL. Next.js
 * bundles the proxy and the webhook route separately, each with its own copy
 * of this module, so the Map lives on `globalThis` to be shared by both. */
type HostCache = ReturnType<typeof createHostCache>;
export const hostCache: HostCache = ((
  globalThis as { __frontlitHostCache?: HostCache }
).__frontlitHostCache ??= createHostCache());

export function invalidateCachedHosts(hosts: string[] | undefined): void {
  if (!hosts) return;
  for (const raw of hosts) {
    const host = normalizeHost(raw);
    if (host) hostCache.delete(host);
  }
}
