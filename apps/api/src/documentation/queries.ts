import { and, cosineDistance, count, eq, gt, inArray, sql } from "drizzle-orm";
import { db } from "../db/client";
import { documentChunks, documents, docSections } from "../db/schema";
import { extractChunks } from "./chunking";
import { getEmbedding, getEmbeddings } from "./embeddings";
import { getResolvedEmbeddingConfig } from "../ai/queries";
import { slugify, uniqueSlug } from "../utils/slug";

/** Re-chunks and re-embeds a published `doc`'s content, replacing its old
 * chunks in one transaction (architecture.md §6.3). Called by the
 * document-index worker after publish or an AI-config backfill — never on
 * draft saves. Only published content is ever searchable/citable. */
export async function reindexDocument(input: {
  teamId: string;
  documentId: string;
  content: unknown;
}) {
  const chunks = extractChunks(input.content as any);

  const embeddingConfig = await getResolvedEmbeddingConfig(input.teamId);
  const embeddings = chunks.length
    ? await getEmbeddings(
        chunks.map((chunk) => chunk.content),
        embeddingConfig,
      )
    : [];

  await db.transaction(async (tx) => {
    await tx
      .delete(documentChunks)
      .where(eq(documentChunks.documentId, input.documentId));
    if (chunks.length) {
      await tx.insert(documentChunks).values(
        chunks.map((chunk, i) => ({
          teamId: input.teamId,
          documentId: input.documentId,
          heading: chunk.heading,
          anchor: chunk.anchor,
          content: chunk.content,
          embedding: embeddings[i],
        })),
      );
    }
  });

  return chunks.length;
}

export async function deleteChunksForDocument(documentId: string) {
  await db.delete(documentChunks).where(eq(documentChunks.documentId, documentId));
}

export async function deleteChunksForTeamKind(
  teamId: string,
  kind: "blog" | "changelog",
) {
  const rows = await db.query.documents.findMany({
    where: and(eq(documents.teamId, teamId), eq(documents.kind, kind)),
    columns: { id: true },
  });
  if (rows.length === 0) return;
  await db.delete(documentChunks).where(
    inArray(
      documentChunks.documentId,
      rows.map((row) => row.id),
    ),
  );
}

export interface SearchResult {
  documentId: string;
  slug: string;
  title: string | null;
  heading: string | null;
  anchor: string | null;
  content: string;
  similarity: number;
  kind: "blog" | "doc" | "changelog";
}

const SIMILARITY_FLOOR = 0.25;

/** Cosine similarity search over a team's published doc chunks
 * (architecture.md §6.4). `cosineDistance` returns `1 - cosine_similarity`,
 * so `similarity = 1 - distance`; results below `SIMILARITY_FLOOR` are
 * dropped rather than fed to a prompt as noise. */
export async function searchChunks(
  teamId: string,
  query: string,
  k = 6,
): Promise<SearchResult[]> {
  const embeddingConfig = await getResolvedEmbeddingConfig(teamId);
  const embedding = await getEmbedding(query, embeddingConfig);
  const similarity = sql<number>`1 - (${cosineDistance(documentChunks.embedding, embedding)})`;

  const rows = await db
    .select({
      documentId: documents.documentId,
      slug: documents.slug,
      title: documents.title,
      heading: documentChunks.heading,
      anchor: documentChunks.anchor,
      content: documentChunks.content,
      similarity,
      kind: documents.kind,
    })
    .from(documentChunks)
    .innerJoin(documents, eq(documentChunks.documentId, documents.id))
    .where(and(eq(documentChunks.teamId, teamId), gt(similarity, SIMILARITY_FLOOR)))
    .orderBy((row) => sql`${row.similarity} desc`)
    .limit(k);

  return rows;
}

// ---------------------------------------------------------------------------
// Doc sections (the help-center nav tree a "doc" document's meta.sectionId
// points into) \u2014 architecture.md §5.1.
// ---------------------------------------------------------------------------

async function sectionSlugTaken(teamId: string, slug: string): Promise<boolean> {
  const existing = await db.query.docSections.findFirst({
    where: and(eq(docSections.teamId, teamId), eq(docSections.slug, slug)),
  });
  return Boolean(existing);
}

export async function createDocSection(input: {
  teamId: string;
  name: string;
  order?: number;
}) {
  const slug = await uniqueSlug(slugify(input.name), (candidate) =>
    sectionSlugTaken(input.teamId, candidate),
  );
  const [section] = await db
    .insert(docSections)
    .values({
      teamId: input.teamId,
      name: input.name,
      slug,
      order: input.order ?? 0,
    })
    .returning();
  return section;
}

export async function listDocSections(teamId: string) {
  return db.query.docSections.findMany({
    where: eq(docSections.teamId, teamId),
    orderBy: (row, { asc }) => asc(row.order),
  });
}

export async function getDocSectionBySectionId(teamId: string, sectionId: string) {
  return db.query.docSections.findFirst({
    where: and(eq(docSections.teamId, teamId), eq(docSections.sectionId, sectionId)),
  });
}

export async function updateDocSection(
  teamId: string,
  sectionId: string,
  patch: Partial<{ name: string; order: number }>,
) {
  const existing = await getDocSectionBySectionId(teamId, sectionId);
  if (!existing) return null;
  const [section] = await db
    .update(docSections)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(docSections.id, existing.id))
    .returning();
  return section;
}

export async function deleteDocSection(teamId: string, sectionId: string) {
  const existing = await getDocSectionBySectionId(teamId, sectionId);
  if (!existing) return { ok: false as const, reason: "not_found" as const };
  await db.delete(docSections).where(eq(docSections.id, existing.id));
  return { ok: true as const };
}

export async function countDocSections(teamId: string) {
  const [{ value }] = await db
    .select({ value: count() })
    .from(docSections)
    .where(eq(docSections.teamId, teamId));
  return value;
}
