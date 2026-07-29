import { and, asc, count, eq, lte } from "drizzle-orm";
import { db } from "../db/client";
import { outboxJobs, type OutboxJobType } from "../db/schema";

export async function enqueueOutboxJob(
    teamId: string,
    type: OutboxJobType,
    payload: Record<string, unknown>,
) {
    const [job] = await db
        .insert(outboxJobs)
        .values({ teamId, type, payload })
        .returning();
    return job;
}

const MAX_ATTEMPTS = 8;

/** Exponential backoff, capped at ~1h, so a prolonged SendLit outage doesn't
 * hammer it while still catching up quickly once it recovers. */
function backoffMs(attempts: number): number {
    return Math.min(1000 * 2 ** attempts, 60 * 60 * 1000);
}

export async function claimNextOutboxJob() {
    const [job] = await db.query.outboxJobs.findMany({
        where: and(
            eq(outboxJobs.status, "pending"),
            lte(outboxJobs.nextAttemptAt, new Date()),
        ),
        orderBy: asc(outboxJobs.nextAttemptAt),
        limit: 1,
    });
    if (!job) return null;

    const [claimed] = await db
        .update(outboxJobs)
        .set({ status: "processing", updatedAt: new Date() })
        .where(and(eq(outboxJobs.id, job.id), eq(outboxJobs.status, "pending")))
        .returning();
    return claimed ?? null;
}

export async function markOutboxJobDone(jobId: string) {
    await db
        .update(outboxJobs)
        .set({ status: "done", updatedAt: new Date() })
        .where(eq(outboxJobs.id, jobId));
}

/** Queue depth + oldest-pending age for `/metrics` (architecture.md §13.6) —
 * computed live from the table rather than tracked in-process, since the
 * queue is shared across every API instance. */
export async function getOutboxQueueStats(): Promise<{
    pendingCount: number;
    oldestPendingAgeSeconds: number | null;
}> {
    const [{ value }] = await db
        .select({ value: count() })
        .from(outboxJobs)
        .where(eq(outboxJobs.status, "pending"));

    const [oldest] = await db.query.outboxJobs.findMany({
        where: eq(outboxJobs.status, "pending"),
        orderBy: asc(outboxJobs.createdAt),
        limit: 1,
    });

    return {
        pendingCount: value,
        oldestPendingAgeSeconds: oldest
            ? Math.floor((Date.now() - oldest.createdAt.getTime()) / 1000)
            : null,
    };
}

export async function markOutboxJobFailed(
    jobId: string,
    attempts: number,
    error: string,
) {
    const failed = attempts + 1 >= MAX_ATTEMPTS;
    await db
        .update(outboxJobs)
        .set({
            status: failed ? "failed" : "pending",
            attempts: attempts + 1,
            lastError: error.slice(0, 2000),
            nextAttemptAt: new Date(Date.now() + backoffMs(attempts)),
            updatedAt: new Date(),
        })
        .where(eq(outboxJobs.id, jobId));
}
