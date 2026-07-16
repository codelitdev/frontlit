import { Router } from "express";
import { renderCounters } from "../services/metrics";
import { getOutboxQueueStats } from "../newsletter/outbox";

/**
 * Prometheus-format metrics (architecture.md §13.6). Deliberately outside
 * the ts-rest contract (like `/health`) — a scrape target, not an API
 * capability. Not gated by `requireAuth`: the same posture as any
 * Prometheus exporter, meant to sit behind network-level access control
 * (a private port/interface) rather than app-level auth.
 */
const router = Router();

router.get("/metrics", async (_req, res) => {
    const { pendingCount, oldestPendingAgeSeconds } = await getOutboxQueueStats();

    const lines = [
        renderCounters(),
        "# TYPE outbox_queue_pending gauge",
        `outbox_queue_pending ${pendingCount}`,
        "# TYPE outbox_queue_oldest_pending_age_seconds gauge",
        ...(oldestPendingAgeSeconds !== null ? [`outbox_queue_oldest_pending_age_seconds ${oldestPendingAgeSeconds}`] : []),
    ];

    res.set("content-type", "text/plain; version=0.0.4; charset=utf-8");
    res.send(lines.filter(Boolean).join("\n") + "\n");
});

export default router;
