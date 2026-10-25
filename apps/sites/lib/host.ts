import type { ResolvedHost } from "./api";
import { getRedis, getRedisSubscriber } from "./redis";

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

const TTL_SECONDS = 60;
const INVALIDATE_CHANNEL = "fl:host-invalidate";
const redisKey = (host: string) => `fl:host:${host}`;

type Shared = {
  inflight: Map<string, Promise<ResolvedHost | null>>;
  subscribed?: boolean;
};
const shared: Shared = ((
  globalThis as { __frontlitHostLookup?: Shared }
).__frontlitHostLookup ??= { inflight: new Map() });

/** Other replicas publish the hosts they invalidated; drop them here too.
 * node-redis re-subscribes by itself after a reconnect. */
function subscribe() {
  const subscriber = getRedisSubscriber();
  if (shared.subscribed || !subscriber) return;
  shared.subscribed = true;
  subscriber
    .subscribe(INVALIDATE_CHANNEL, (message) => {
      for (const host of JSON.parse(message) as string[]) hostCache.delete(host);
    })
    .catch(() => {
      shared.subscribed = false;
    });
}

/**
 * Host → team, cached in this process and, with `REDIS_URL`, in Redis so
 * every replica shares lookups and invalidations (docs/site-delivery.md
 * §4.7). Concurrent misses for one host share a single API call. Throws
 * when the API is unreachable, so an outage is never cached as a 404.
 */
export async function lookupHost(
  host: string,
  resolve: (host: string) => Promise<ResolvedHost | null>,
): Promise<ResolvedHost | null> {
  const local = hostCache.get(host);
  if (local !== undefined) return local;
  const pending = shared.inflight.get(host);
  if (pending) return pending;

  const lookup = (async () => {
    subscribe();
    const redis = getRedis();
    if (redis) {
      const stored = await redis.get(redisKey(host)).catch(() => null);
      if (stored !== null) {
        const value = JSON.parse(stored) as ResolvedHost | null;
        hostCache.set(host, value);
        return value;
      }
    }
    const value = await resolve(host);
    hostCache.set(host, value);
    await redis
      ?.set(redisKey(host), JSON.stringify(value), { EX: TTL_SECONDS })
      .catch(() => {});
    return value;
  })();
  shared.inflight.set(host, lookup);
  try {
    return await lookup;
  } finally {
    shared.inflight.delete(host);
  }
}

/** Forgets hosts after a domain change, on every replica. */
export async function invalidateCachedHosts(
  hosts: string[] | undefined,
): Promise<void> {
  const list = (hosts ?? []).map(normalizeHost).filter(Boolean);
  if (!list.length) return;
  for (const host of list) hostCache.delete(host);
  const redis = getRedis();
  if (!redis) return;
  await redis.del(list.map(redisKey)).catch(() => {});
  await redis.publish(INVALIDATE_CHANNEL, JSON.stringify(list)).catch(() => {});
}
