import type { ResolvedHost } from "./api";

export type HostDecision =
    | { action: "unknown" }
    | { action: "redirect"; url: string }
    | { action: "rewrite"; teamId: string };

/**
 * Pure decision logic for the tenant-resolution middleware (architecture.md
 * §12.2): given what `resolve-host` returned for the request's `Host`
 * header, decide whether to pass through untouched (unknown host — let
 * Next's normal 404 handle it), 308 to the primary host, or rewrite to the
 * tenant's `/sites/[teamId]/...` segment. Kept host-effect-free (no
 * `NextResponse`, no `fetch`) so it's unit-testable without a request.
 */
export function decideHost(resolved: ResolvedHost | null, requestUrl: { pathname: string; search: string; protocol: string }): HostDecision {
    if (!resolved) return { action: "unknown" };
    if (!resolved.isPrimary) {
        return { action: "redirect", url: `${requestUrl.protocol}//${resolved.primaryHost}${requestUrl.pathname}${requestUrl.search}` };
    }
    return { action: "rewrite", teamId: resolved.teamId };
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
