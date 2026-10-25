import express, { Router } from "express";
import { renderCounters } from "../services/metrics";
import { getOutboxQueueStats } from "../email/outbox";
import { siteCacheOutboxStats } from "../services/site-cache";
import {
  allowRumBeacon,
  recordRumBeacon,
  renderRumMetrics,
  rumBeaconSchema,
} from "../services/rum";

/**
 * Prometheus-format metrics (architecture.md §13.6). Deliberately outside
 * the ts-rest contract (like `/health`) — a scrape target, not an API
 * capability. Not gated by `requireAuth`: the same posture as any
 * Prometheus exporter, meant to sit behind network-level access control
 * (a private port/interface) rather than app-level auth.
 */
const router = Router();

router.get("/metrics", async (_req, res) => {
  const [{ pendingCount, oldestPendingAgeSeconds }, siteCache] = await Promise.all([
    getOutboxQueueStats(),
    siteCacheOutboxStats(),
  ]);

  const lines = [
    renderCounters(),
    renderRumMetrics(),
    "# TYPE outbox_queue_pending gauge",
    `outbox_queue_pending ${pendingCount}`,
    "# TYPE outbox_queue_oldest_pending_age_seconds gauge",
    ...(oldestPendingAgeSeconds !== null
      ? [`outbox_queue_oldest_pending_age_seconds ${oldestPendingAgeSeconds}`]
      : []),
    "# HELP site_cache_invalidations_pending Public-site cache invalidations not yet delivered everywhere",
    "# TYPE site_cache_invalidations_pending gauge",
    `site_cache_invalidations_pending ${siteCache.pending}`,
    "# TYPE site_cache_invalidations_oldest_age_seconds gauge",
    ...(siteCache.oldestSeconds !== null
      ? [
          `site_cache_invalidations_oldest_age_seconds ${Math.round(Number(siteCache.oldestSeconds))}`,
        ]
      : []),
  ];

  res.set("content-type", "text/plain; version=0.0.4; charset=utf-8");
  res.send(lines.filter(Boolean).join("\n") + "\n");
});

/**
 * Web Vitals beacon from public-site visitors (`navigator.sendBeacon`, sent
 * as text/plain so no CORS preflight is needed). Anonymous and cheap: it
 * only updates in-memory histograms, so it has its own per-client limit
 * instead of the database-backed public limiter.
 */
router.post("/rum", express.text({ type: "*/*", limit: "4kb" }), (req, res) => {
  if (!allowRumBeacon(req.ip ?? "unknown")) return res.status(429).end();
  let body: unknown;
  try {
    body = JSON.parse(typeof req.body === "string" ? req.body : "");
  } catch {
    return res.status(400).end();
  }
  const parsed = rumBeaconSchema.safeParse(body);
  if (!parsed.success) return res.status(400).end();
  recordRumBeacon(parsed.data);
  res.status(204).end();
});

export default router;
