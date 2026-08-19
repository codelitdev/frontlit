import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { documents } from "../db/schema";
import { logger } from "../services/log";
import { incrementCounter } from "../services/metrics";
import { deleteChunksForDocument, reindexDocument } from "./queries";
import { isDocIndexable } from "./index-status";
import { teamIndexesKind } from "./index-policy";
import {
    claimNextDocumentIndexJob,
    finishDocumentIndexJob,
} from "./index-jobs";

export async function processOneDocumentIndexJob(): Promise<boolean> {
    const job = await claimNextDocumentIndexJob();
    if (!job) return false;
    incrementCounter("document_index_jobs_total", { event: "claimed" });

    try {
        const doc = await db.query.documents.findFirst({
            where: eq(documents.id, job.documentId),
        });
        if (
            !doc ||
            !doc.publishedAt ||
            !(await teamIndexesKind(job.teamId, doc.kind)) ||
            !isDocIndexable(doc.meta)
        ) {
            await deleteChunksForDocument(job.documentId);
            await finishDocumentIndexJob(job.id, job.generation, {
                status: "done",
            });
            incrementCounter("document_index_jobs_total", {
                event: "skipped",
            });
            return true;
        }

        await reindexDocument({
            teamId: job.teamId,
            documentId: doc.id,
            content: doc.content,
        });
        await finishDocumentIndexJob(job.id, job.generation, {
            status: "done",
        });
        incrementCounter("document_index_jobs_total", { event: "done" });
    } catch (error) {
        const lastError =
            error instanceof Error ? error.message : String(error);
        await finishDocumentIndexJob(job.id, job.generation, {
            status: "failed",
            lastError,
        });
        incrementCounter("document_index_jobs_total", { event: "failed" });
        logger.warn(
            { jobId: job.id, documentId: job.documentId, error: lastError },
            "Document index job failed",
        );
    }
    return true;
}

export function startDocumentIndexWorker(intervalMs = 2000): () => void {
    let stopped = false;

    async function tick() {
        if (stopped) return;
        try {
            let work = await processOneDocumentIndexJob();
            while (work && !stopped) {
                work = await processOneDocumentIndexJob();
            }
        } catch (error) {
            logger.error(
                {
                    error:
                        error instanceof Error ? error.message : String(error),
                },
                "Document index worker tick failed",
            );
        }
        if (!stopped) setTimeout(tick, intervalMs);
    }

    setTimeout(tick, intervalMs);
    return () => {
        stopped = true;
    };
}
