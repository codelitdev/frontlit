import { and, asc, eq, lte, or, sql } from "drizzle-orm";
import { db } from "../db/client";
import { inboxAiRuns } from "../db/schema";
import { logger } from "../services/log";
import { incrementCounter } from "../services/metrics";
import { TICKET_PROVIDER_RETRIES } from "./config";
import { runInboxAi, ticketHasActiveLease } from "./generate";
import {
    claimNextTicketMail,
    failTicketMailJob,
    processTicketMailJob,
} from "./mail";

async function claimNextAiJob() {
    const now = new Date();
    const [job] = await db.query.inboxAiRuns.findMany({
        where: and(
            eq(inboxAiRuns.channel, "tickets"),
            or(
                eq(inboxAiRuns.status, "queued"),
                and(
                    eq(inboxAiRuns.status, "generating"),
                    lte(inboxAiRuns.leaseExpiresAt, now),
                ),
                and(
                    eq(inboxAiRuns.status, "failed"),
                    sql`${inboxAiRuns.attempts} <= ${TICKET_PROVIDER_RETRIES}`,
                ),
            ),
        ),
        orderBy: asc(inboxAiRuns.createdAt),
        limit: 20,
    });
    if (!job) return null;
    if (await ticketHasActiveLease(job.ticketId, job.id)) {
        incrementCounter("inbox_ai_jobs_total", { event: "lease_wait" });
        return null;
    }
    if (job.status === "generating") {
        incrementCounter("inbox_ai_jobs_total", { event: "lease_reclaimed" });
    }
    return job;
}

async function processOneAiJob(): Promise<boolean> {
    const job = await claimNextAiJob();
    if (!job) return false;
    incrementCounter("inbox_ai_jobs_total", { event: "claimed" });
    const result = await runInboxAi({
        teamId: job.teamId,
        ticketDbId: job.ticketId,
        triggerMessageId: job.triggerMessageId,
        channel: "tickets",
        mode: "job",
        runId: job.id,
    });
    if (result.skipReason === "lease_wait") return true;
    incrementCounter("inbox_ai_jobs_total", {
        event: result.outcome === "human_only" ? "skipped" : result.outcome,
    });
    return true;
}

async function processOneMailJob(): Promise<boolean> {
    const job = await claimNextTicketMail();
    if (!job) return false;
    try {
        await processTicketMailJob(job);
    } catch (error) {
        await failTicketMailJob(
            job,
            error instanceof Error ? error.message : String(error),
        );
    }
    return true;
}

export function startInboxAiWorker(intervalMs = 2000): () => void {
    let stopped = false;

    async function tick() {
        if (stopped) return;
        try {
            let work = true;
            while (work && !stopped) {
                const ai = await processOneAiJob();
                const mail = await processOneMailJob();
                work = ai || mail;
            }
        } catch (error) {
            logger.error(
                {
                    error:
                        error instanceof Error ? error.message : String(error),
                },
                "Inbox AI worker tick failed",
            );
        }
        if (!stopped) setTimeout(tick, intervalMs);
    }

    setTimeout(tick, intervalMs);
    return () => {
        stopped = true;
    };
}
