import { signWebhookPayload } from "./webhook-signing";

/**
 * Purging an optional edge cache / CDN in front of the public sites
 * (docs/site-delivery.md §5). Only used when apps/sites runs with
 * `EDGE_CACHE_MODE=purge`. Tags are the same names the sites send in
 * `Surrogate-Key` / `Cache-Tag`.
 */
export interface EdgePurgeAdapter {
  purge(input: { teamId: string; tags: string[] }): Promise<void>;
}

/** Generic adapter: a signed POST of `{ teamId, tags }` to `EDGE_PURGE_URL`,
 * signed with `EDGE_PURGE_SECRET` like every other FrontLit webhook
 * (`x-frontlit-timestamp` / `x-frontlit-signature`). Self-hosters connect
 * any cache with a small receiver (see deploy/edge-cache). */
export function httpPurgeAdapter(url: string, secret: string): EdgePurgeAdapter {
  return {
    async purge({ teamId, tags }) {
      const body = JSON.stringify({ teamId, tags });
      const timestamp = Date.now();
      const response = await fetch(url, {
        method: "POST",
        body,
        headers: {
          "content-type": "application/json",
          "x-frontlit-timestamp": String(timestamp),
          "x-frontlit-signature": signWebhookPayload(secret, body, timestamp),
        },
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error(`Edge purge rejected (${response.status})`);
    },
  };
}

/**
 * Hosted FrontLit on Cloudflare (for SaaS): purge by `Cache-Tag` in the zone
 * every custom hostname is attached to. Tags carry the public team ID, so
 * one team's purge never touches another's pages. Batched below
 * Cloudflare's per-request tag limit.
 */
export function cloudflarePurgeAdapter(
  zoneId: string,
  apiToken: string,
  baseUrl = "https://api.cloudflare.com/client/v4",
): EdgePurgeAdapter {
  return {
    async purge({ tags }) {
      for (let start = 0; start < tags.length; start += 30) {
        const response = await fetch(`${baseUrl}/zones/${zoneId}/purge_cache`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${apiToken}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ tags: tags.slice(start, start + 30) }),
          signal: AbortSignal.timeout(10_000),
        });
        const result = (await response.json().catch(() => null)) as {
          success?: boolean;
          errors?: { message?: string }[];
        } | null;
        if (!response.ok || !result?.success) {
          throw new Error(
            `Cloudflare purge failed (${response.status}): ${result?.errors?.[0]?.message ?? "no details"}`,
          );
        }
      }
    },
  };
}

/** The configured adapter, or null when no edge cache needs purging. */
export function edgePurgeAdapter(env = process.env): EdgePurgeAdapter | null {
  const adapter = env.EDGE_PURGE_ADAPTER || "http";
  if (adapter === "http") {
    if (!env.EDGE_PURGE_URL || !env.EDGE_PURGE_SECRET) return null;
    return httpPurgeAdapter(env.EDGE_PURGE_URL, env.EDGE_PURGE_SECRET);
  }
  if (adapter === "cloudflare") {
    if (!env.CLOUDFLARE_ZONE_ID || !env.CLOUDFLARE_API_TOKEN) return null;
    return cloudflarePurgeAdapter(env.CLOUDFLARE_ZONE_ID, env.CLOUDFLARE_API_TOKEN);
  }
  throw new Error(`Unknown EDGE_PURGE_ADAPTER "${adapter}"`);
}

/**
 * Outbox destinations for an edge purge, delivered after `sites` (Layer 1)
 * acknowledges, so the edge can't refill from a stale origin. The second
 * purge, ten seconds later, catches pages whose render started before the
 * origin was invalidated and was stored at the edge after the first purge.
 */
export const EDGE_DESTINATIONS = ["edge", "edge-repeat"] as const;
export const EDGE_REPEAT_DELAY_MS = 10_000;

/** Edge destinations whenever edge purging is configured at all. A broken
 * configuration then fails delivery (retried and logged) rather than
 * dropping purges or failing the publish itself. */
export function edgeDestinations(env = process.env): string[] {
  return env.EDGE_PURGE_URL || env.EDGE_PURGE_ADAPTER ? [...EDGE_DESTINATIONS] : [];
}

/** Thrown by a destination that isn't due yet; the outbox reschedules it
 * without counting a failure. */
export class NotYetDue extends Error {
  constructor(readonly at: Date) {
    super("Destination not due yet");
  }
}

/** Delivers an `edge` / `edge-repeat` destination for one outbox event. */
export async function deliverEdgePurge(
  destination: string,
  event: { createdAt: Date },
  teamId: string,
  tags: string[],
): Promise<void> {
  if (destination === "edge-repeat") {
    const due = event.createdAt.getTime() + EDGE_REPEAT_DELAY_MS;
    if (Date.now() < due) throw new NotYetDue(new Date(due));
  }
  const adapter = edgePurgeAdapter();
  if (!adapter) throw new Error("No edge purge adapter configured");
  await adapter.purge({ teamId, tags });
}
