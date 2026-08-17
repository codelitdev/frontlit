import { count, inArray } from "drizzle-orm";
import { db } from "../db/client";
import {
    documentChunks,
    documentIndexJobs,
    type DocumentKind,
} from "../db/schema";
import { teamIndexesKind } from "./index-policy";

export type PublicDocumentIndex = {
    state: "pending" | "indexed" | "failed" | "excluded";
    lastError: string | null;
};

export function isDocIndexable(meta: unknown): boolean {
    if (!meta || typeof meta !== "object") return true;
    return (meta as { indexable?: unknown }).indexable !== false;
}

export async function attachDocumentIndex<
    T extends {
        id: string;
        teamId?: string;
        publishedAt: Date | string | null;
        meta?: unknown;
    },
>(
    kind: DocumentKind,
    docs: T[],
): Promise<Array<T & { index?: PublicDocumentIndex | null }>> {
    if (docs.length === 0) return docs;
    const teamId = docs[0]?.teamId;
    if (kind !== "doc") {
        if (!teamId || !(await teamIndexesKind(teamId, kind))) {
            return docs.map((doc) => ({ ...doc, index: null }));
        }
    }

    const ids = docs.map((doc) => doc.id);
    const [jobs, chunkRows] = await Promise.all([
        db.query.documentIndexJobs.findMany({
            where: inArray(documentIndexJobs.documentId, ids),
        }),
        db
            .select({
                documentId: documentChunks.documentId,
                n: count(),
            })
            .from(documentChunks)
            .where(inArray(documentChunks.documentId, ids))
            .groupBy(documentChunks.documentId),
    ]);

    const jobByDoc = new Map(jobs.map((job) => [job.documentId, job]));
    const chunksByDoc = new Map(
        chunkRows.map((row) => [row.documentId, Number(row.n)]),
    );

    return docs.map((doc) => ({
        ...doc,
        index: indexForPublishedDoc(
            Boolean(doc.publishedAt),
            isDocIndexable(doc.meta),
            jobByDoc.get(doc.id),
            chunksByDoc.get(doc.id) ?? 0,
        ),
    }));
}

export function indexForPublishedDoc(
    published: boolean,
    indexable: boolean,
    job:
        | {
              status: string;
              lastError: string | null;
          }
        | undefined,
    chunkCount: number,
): PublicDocumentIndex | null {
    if (!published) return null;
    if (!indexable) {
        return { state: "excluded", lastError: null };
    }
    if (job?.status === "failed") {
        return { state: "failed", lastError: job.lastError };
    }
    if (job?.status === "queued" || job?.status === "running") {
        return { state: "pending", lastError: null };
    }
    if (job?.status === "done" || chunkCount > 0) {
        return { state: "indexed", lastError: null };
    }
    return { state: "pending", lastError: null };
}

export async function attachOneDocumentIndex<
    T extends { id: string; publishedAt: Date | string | null },
>(kind: DocumentKind, doc: T | null) {
    if (!doc) return null;
    const [withIndex] = await attachDocumentIndex(kind, [doc]);
    return withIndex;
}
