import { and, asc, eq, isNotNull, lte, or, sql } from "drizzle-orm";
import { db } from "../db/client";
import {
    documentIndexJobs,
    documents,
    type DocumentIndexJobStatus,
} from "../db/schema";
import { isDocIndexable } from "./index-status";
import { teamIndexesKind } from "./index-policy";

const MAX_ATTEMPTS = 5;
const LEASE_MS = 120_000;

export async function enqueueDocumentIndex(teamId: string, documentId: string) {
    await db
        .insert(documentIndexJobs)
        .values({
            teamId,
            documentId,
            status: "queued",
            generation: 1,
        })
        .onConflictDoUpdate({
            target: documentIndexJobs.documentId,
            set: {
                status: "queued",
                lastError: null,
                leaseExpiresAt: null,
                finishedAt: null,
                generation: sql`${documentIndexJobs.generation} + 1`,
                updatedAt: new Date(),
            },
        });
}

export async function enqueuePublishedDocsForTeam(teamId: string) {
    const published = await db.query.documents.findMany({
        where: and(
            eq(documents.teamId, teamId),
            isNotNull(documents.publishedAt),
        ),
        columns: { id: true, kind: true, meta: true },
    });
    const indexBlog = await teamIndexesKind(teamId, "blog");
    const indexChangelog = await teamIndexesKind(teamId, "changelog");
    let enqueued = 0;
    for (const doc of published) {
        const kindAllowed =
            doc.kind === "doc" ||
            (doc.kind === "blog" && indexBlog) ||
            (doc.kind === "changelog" && indexChangelog);
        if (!kindAllowed) continue;
        if (!isDocIndexable(doc.meta)) continue;
        await enqueueDocumentIndex(teamId, doc.id);
        enqueued += 1;
    }
    return enqueued;
}

export async function claimNextDocumentIndexJob() {
    const now = new Date();
    const [job] = await db.query.documentIndexJobs.findMany({
        where: or(
            eq(documentIndexJobs.status, "queued"),
            and(
                eq(documentIndexJobs.status, "running"),
                lte(documentIndexJobs.leaseExpiresAt, now),
            ),
            and(
                eq(documentIndexJobs.status, "failed"),
                sql`${documentIndexJobs.attempts} < ${MAX_ATTEMPTS}`,
            ),
        ),
        orderBy: asc(documentIndexJobs.createdAt),
        limit: 1,
    });
    if (!job) return null;

    const [claimed] = await db
        .update(documentIndexJobs)
        .set({
            status: "running",
            attempts: job.attempts + 1,
            leaseExpiresAt: new Date(Date.now() + LEASE_MS),
            startedAt: job.startedAt ?? now,
            updatedAt: now,
        })
        .where(
            and(
                eq(documentIndexJobs.id, job.id),
                or(
                    eq(documentIndexJobs.status, "queued"),
                    eq(documentIndexJobs.status, "failed"),
                    and(
                        eq(documentIndexJobs.status, "running"),
                        lte(documentIndexJobs.leaseExpiresAt, now),
                    ),
                ),
            ),
        )
        .returning();
    return claimed ?? null;
}

export async function finishDocumentIndexJob(
    jobId: string,
    generation: number,
    result:
        | { status: Extract<DocumentIndexJobStatus, "done"> }
        | {
              status: Extract<DocumentIndexJobStatus, "failed">;
              lastError: string;
          },
) {
    const now = new Date();
    await db
        .update(documentIndexJobs)
        .set({
            status: result.status,
            lastError: result.status === "failed" ? result.lastError : null,
            leaseExpiresAt: null,
            finishedAt: now,
            updatedAt: now,
        })
        .where(
            and(
                eq(documentIndexJobs.id, jobId),
                eq(documentIndexJobs.generation, generation),
                eq(documentIndexJobs.status, "running"),
            ),
        );
}
