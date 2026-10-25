import { randomUUID } from "node:crypto";
import { and, eq, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "../db/client";
import { siteCacheOutbox, teams } from "../db/schema";
import { logger } from "./log";
import { signWebhookPayload } from "./webhook-signing";
import {
  deliverEdgePurge,
  edgeDestinations,
  edgePurgeAdapter,
  NotYetDue,
} from "./edge-purge";

/**
 * Public-site cache invalidation (docs/site-delivery.md §4.5). apps/sites
 * caches rendered pages and public reads under these tags; every change to
 * published content writes the tags it affects to `site_cache_outbox`, and
 * the worker below delivers them to the signed revalidate webhook with
 * retries.
 */
export const siteTags = {
  /** Every cached entry of the team. */
  team: (teamId: string) => `team:${teamId}`,
  /** Settings, theme, chrome, chatbot and code injection: on every page. */
  shell: (teamId: string) => `shell:${teamId}`,
  page: (teamId: string, slug: string) => `page:${teamId}:${slug}`,
  docs: (teamId: string) => `docs:${teamId}`,
  blog: (teamId: string) => `blog:${teamId}`,
  changelog: (teamId: string) => `changelog:${teamId}`,
  sitemap: (teamId: string) => `sitemap:${teamId}`,
};

type Executor = Pick<typeof db, "insert" | "query">;
type TagBuilder = (publicTeamId: string) => string[];

/** Where invalidations go: the sites (Layer 1), then an edge cache when
 * one is configured. Unset secret = no public site to invalidate. */
function destinations(): string[] {
  return process.env.REVALIDATE_WEBHOOK_SECRET ? ["sites", ...edgeDestinations()] : [];
}

/**
 * Records a cache invalidation for `teamId` (internal ID). Pass the
 * transaction that changes the content so the event commits with it.
 */
export async function invalidateSiteCache(
  teamId: string,
  tags: TagBuilder,
  options: { invalidateHosts?: string[]; executor?: Executor } = {},
): Promise<void> {
  const targets = destinations();
  if (!targets.length) return;
  const executor = options.executor ?? db;
  const team = await executor.query.teams.findFirst({
    where: eq(teams.id, teamId),
    columns: { teamId: true },
  });
  if (!team) return;
  const list = [...new Set(tags(team.teamId))];
  if (!list.length) return;
  await executor.insert(siteCacheOutbox).values({
    teamId,
    tags: list,
    invalidateHosts: options.invalidateHosts?.length ? options.invalidateHosts : null,
    destinations: targets,
  });
  scheduleDelivery();
}

interface ReleaseShape {
  site: unknown;
  pages: { pageId: string | null; slug: string; revisionId: string }[];
}

/** Tags a release activation changes: pages whose slug or revision moved,
 * plus `shell` when the site snapshot (header, footer, theme, redirects)
 * changed, since every page renders it. */
export function releaseChangeTags(
  teamId: string,
  before: ReleaseShape | null,
  after: ReleaseShape,
): string[] {
  const tags: string[] = [];
  if (JSON.stringify(before?.site ?? null) !== JSON.stringify(after.site)) {
    tags.push(siteTags.shell(teamId));
  }
  // Git-owned pages have no builder page ID; their slug identifies them.
  const key = (page: ReleaseShape["pages"][number]) => page.pageId ?? `/${page.slug}`;
  const previous = new Map((before?.pages ?? []).map((page) => [key(page), page]));
  const next = new Map(after.pages.map((page) => [key(page), page]));
  for (const id of new Set([...previous.keys(), ...next.keys()])) {
    const a = previous.get(id);
    const b = next.get(id);
    if (a && b && a.slug === b.slug && a.revisionId === b.revisionId) continue;
    if (a) tags.push(siteTags.page(teamId, a.slug));
    if (b) tags.push(siteTags.page(teamId, b.slug));
  }
  if (tags.some((tag) => tag.startsWith("page:"))) tags.push(siteTags.sitemap(teamId));
  return [...new Set(tags)];
}

/** The signed request for the `sites` destination. */
export function revalidateRequest(
  event: { eventId: string; tags: string[]; invalidateHosts: string[] | null },
  publicTeamId: string,
  secret: string,
  base: string,
  timestamp = Date.now(),
): { url: string; init: RequestInit } {
  const body = JSON.stringify({
    eventId: event.eventId,
    teamId: publicTeamId,
    tags: event.tags,
    ...(event.invalidateHosts?.length
      ? { invalidateHosts: event.invalidateHosts }
      : {}),
  });
  return {
    url: `${base}/api/webhooks/revalidate`,
    init: {
      method: "POST",
      body,
      headers: {
        "content-type": "application/json",
        "x-frontlit-timestamp": String(timestamp),
        "x-frontlit-signature": signWebhookPayload(secret, body, timestamp),
      },
      signal: AbortSignal.timeout(10_000),
    },
  };
}

type OutboxRow = typeof siteCacheOutbox.$inferSelect;

async function deliver(destination: string, event: OutboxRow): Promise<void> {
  const team = await db.query.teams.findFirst({
    where: eq(teams.id, event.teamId),
    columns: { teamId: true },
  });
  if (!team) return;
  if (destination === "edge" || destination === "edge-repeat") {
    return deliverEdgePurge(destination, event, team.teamId, event.tags);
  }
  if (destination !== "sites") throw new Error(`Unknown destination ${destination}`);
  const secret = process.env.REVALIDATE_WEBHOOK_SECRET;
  if (!secret) throw new Error("REVALIDATE_WEBHOOK_SECRET is not set");
  const { url, init } = revalidateRequest(
    event,
    team.teamId,
    secret,
    process.env.SITES_REVALIDATE_URL ||
      process.env.SITES_BASE_URL ||
      "http://localhost:3002",
  );
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`Sites rejected invalidation (${response.status})`);
}

const LEASE_MS = 60_000;

/** Delivers one due event to every destination it hasn't acknowledged.
 * Returns false when there was nothing to do. */
export async function deliverSiteCacheEvent(): Promise<boolean> {
  const now = sql`now()`;
  const row = await db.query.siteCacheOutbox.findFirst({
    where: and(
      isNull(siteCacheOutbox.completedAt),
      lte(siteCacheOutbox.nextAttemptAt, now),
      or(
        isNull(siteCacheOutbox.leaseExpiresAt),
        lte(siteCacheOutbox.leaseExpiresAt, now),
      ),
    ),
    orderBy: siteCacheOutbox.createdAt,
  });
  if (!row) return false;
  const token = randomUUID();
  const [claimed] = await db
    .update(siteCacheOutbox)
    .set({
      leaseToken: token,
      leaseExpiresAt: new Date(Date.now() + LEASE_MS),
      attempts: row.attempts + 1,
    })
    .where(
      and(
        eq(siteCacheOutbox.eventId, row.eventId),
        or(
          isNull(siteCacheOutbox.leaseExpiresAt),
          lte(siteCacheOutbox.leaseExpiresAt, now),
        ),
      ),
    )
    .returning();
  if (!claimed) return true;
  const owned = and(
    eq(siteCacheOutbox.eventId, claimed.eventId),
    eq(siteCacheOutbox.leaseToken, token),
  );
  const acknowledgments = [...claimed.acknowledgments];
  try {
    for (const destination of claimed.destinations) {
      if (acknowledgments.includes(destination)) continue;
      await deliver(destination, claimed);
      acknowledgments.push(destination);
      await db.update(siteCacheOutbox).set({ acknowledgments }).where(owned);
    }
    await db
      .update(siteCacheOutbox)
      .set({ completedAt: new Date(), leaseToken: null, leaseExpiresAt: null })
      .where(owned);
  } catch (error) {
    if (error instanceof NotYetDue) {
      await db
        .update(siteCacheOutbox)
        .set({ nextAttemptAt: error.at, leaseToken: null, leaseExpiresAt: null })
        .where(owned);
      return true;
    }
    logger.warn(
      {
        eventId: claimed.eventId,
        attempts: claimed.attempts,
        error: error instanceof Error ? error.message : String(error),
      },
      "Site cache invalidation failed; will retry",
    );
    await db
      .update(siteCacheOutbox)
      .set({
        nextAttemptAt: new Date(
          Date.now() + Math.min(300_000, 1000 * 2 ** Math.min(claimed.attempts, 8)),
        ),
        leaseToken: null,
        leaseExpiresAt: null,
      })
      .where(owned);
  }
  return true;
}

async function drain() {
  for (let i = 0; i < 50; i++) if (!(await deliverSiteCacheEvent())) break;
}

let scheduled: ReturnType<typeof setTimeout> | null = null;

/** Delivers soon after a write instead of waiting for the next tick. An
 * event written in a still-open transaction is picked up by the worker. */
function scheduleDelivery() {
  if (scheduled) return;
  scheduled = setTimeout(() => {
    scheduled = null;
    drain().catch(() => {});
  }, 50);
}

export function startSiteCacheWorker(intervalMs = 1000): () => void {
  if (edgeDestinations().length) {
    try {
      if (!edgePurgeAdapter())
        throw new Error("EDGE_PURGE_URL and EDGE_PURGE_SECRET are required");
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        "Edge purging is misconfigured; edge purges will retry until it is fixed",
      );
    }
  }
  let stopped = false;
  let lastCleanup = 0;
  async function tick() {
    if (stopped) return;
    try {
      await drain();
      if (Date.now() - lastCleanup > 3_600_000) {
        await db
          .delete(siteCacheOutbox)
          .where(
            lte(siteCacheOutbox.completedAt, new Date(Date.now() - 7 * 86_400_000)),
          );
        lastCleanup = Date.now();
      }
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        "Site cache worker failed",
      );
    }
    if (!stopped) setTimeout(tick, intervalMs);
  }
  setTimeout(tick, intervalMs);
  return () => {
    stopped = true;
  };
}
