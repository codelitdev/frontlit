import { readDocumentation } from "./publications";
import type { DocumentKind } from "../db/schema";
import { teamIndexesKind } from "./index-policy";
import { searchIndexStateFor } from "../search/indexer";

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

  if (kind === "doc" && teamId && docs.every((doc) => "documentId" in doc)) {
    const live = await readDocumentation(teamId);
    return docs.map((doc) => ({
      ...doc,
      index: !doc.publishedAt
        ? null
        : {
            state:
              live.indexing.enabled &&
              live.items.some(
                (item) =>
                  item.documentId === (doc as any).documentId &&
                  isDocIndexable(item.meta),
              )
                ? ("indexed" as const)
                : ("excluded" as const),
            lastError: null,
          },
    }));
  }
  const { indexed, request } = await searchIndexStateFor(
    teamId!,
    kind,
    docs.map((doc) => (doc as any).documentId as string),
  );
  return docs.map((doc) => ({
    ...doc,
    index: indexForPublishedDoc(
      Boolean(doc.publishedAt),
      isDocIndexable(doc.meta),
      request,
      indexed.has((doc as any).documentId),
    ),
  }));
}

export function indexForPublishedDoc(
  published: boolean,
  indexable: boolean,
  request: { lastError: string | null } | null,
  indexed: boolean,
): PublicDocumentIndex | null {
  if (!published) return null;
  if (!indexable) return { state: "excluded", lastError: null };
  if (request?.lastError) return { state: "failed", lastError: request.lastError };
  if (request || !indexed) return { state: "pending", lastError: null };
  return { state: "indexed", lastError: null };
}

export async function attachOneDocumentIndex<
  T extends { id: string; publishedAt: Date | string | null },
>(kind: DocumentKind, doc: T): Promise<T & { index?: PublicDocumentIndex | null }> {
  const [withIndex] = await attachDocumentIndex(kind, [doc]);
  return withIndex!;
}
