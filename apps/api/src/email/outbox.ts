import { and, asc, count, eq, inArray, lte, ne } from "drizzle-orm";
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

/** Default on: a missing/invalid org key is operator config, not a
 * permanent team failure. Set `SENDLIT_PROVISION_RETRY_FOREVER=false` to
 * stop after 8 attempts like other outbox jobs. */
export function provisionRetryForeverEnabled(): boolean {
    const raw = process.env.SENDLIT_PROVISION_RETRY_FOREVER;
    if (raw === undefined || raw === "") return true;
    return !["0", "false", "no", "off"].includes(raw.trim().toLowerCase());
}

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
    options: { retryForever?: boolean } = {},
) {
    const failed = !options.retryForever && attempts + 1 >= MAX_ATTEMPTS;
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

/** Teams created while `SENDLIT_ORGANIZATION_API_KEY` was missing or
 * rejected exhaust 8 attempts and sit in `failed`. The worker never
 * claims those rows, so ESP stays "provisioning" even after the key is
 * fixed. Reset them on boot so the next tick retries immediately. */
export async function requeueFailedProvisionJobs(): Promise<number> {
    const rows = await db
        .update(outboxJobs)
        .set({
            status: "pending",
            attempts: 0,
            nextAttemptAt: new Date(),
            updatedAt: new Date(),
        })
        .where(
            and(
                eq(outboxJobs.type, "provision_sendlit"),
                eq(outboxJobs.status, "failed"),
            ),
        )
        .returning({ id: outboxJobs.id });
    return rows.length;
}

/** Reset this team's unfinished `provision_sendlit` job so the worker (or
 * an immediate retry) can run it now. Inserts a row if none exists. */
export async function requeueTeamProvisionJob(
    teamId: string,
    payload: Record<string, unknown>,
) {
    const existing = await db.query.outboxJobs.findMany({
        where: and(
            eq(outboxJobs.teamId, teamId),
            eq(outboxJobs.type, "provision_sendlit"),
            ne(outboxJobs.status, "done"),
        ),
    });
    if (existing.length === 0) {
        return enqueueOutboxJob(teamId, "provision_sendlit", payload);
    }
    await db
        .update(outboxJobs)
        .set({
            status: "pending",
            attempts: 0,
            lastError: null,
            payload,
            nextAttemptAt: new Date(),
            updatedAt: new Date(),
        })
        .where(
            inArray(
                outboxJobs.id,
                existing.map((job) => job.id),
            ),
        );
    return existing[0];
}
