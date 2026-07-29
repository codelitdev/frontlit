import type { ResolvedHost } from "./api";

export type HostDecision =
    | { action: "unknown" }
    | { action: "rewrite"; teamId: string };

/**
 * Pure decision logic for the tenant-resolution middleware (architecture.md
 * §12.2): given what `resolve-host` returned for the request's `Host`
 * header, decide whether to pass through untouched (unknown host — let
 * Next's normal 404 handle it), or rewrite to the tenant's
 * `/sites/[teamId]/...` segment. Both the permanent FrontLit subdomain and
 * a verified custom domain serve the website; `canonicalHost` is used for
 * SEO, not redirects. Kept host-effect-free (no
 * `NextResponse`, no `fetch`) so it's unit-testable without a request.
 */
export function decideHost(resolved: ResolvedHost | null, _requestUrl: { pathname: string; search: string; protocol: string }): HostDecision {
    if (!resolved) return { action: "unknown" };
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
 * within one server instance/edge isolate; invalidation on domain changes
 * is a webhook follow-up (architecture.md §12.2/§15 milestone 10), so a
 * short TTL bounds staleness in the meantime.
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
    };
}
