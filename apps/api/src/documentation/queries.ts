import { searchPublishedDocumentation } from "./publications";
import { DocsContentError, diagnostic } from "@frontlit/text-editor/docs";
import { lockSettings, DraftConflict } from "./authoring";
import { withDbTransaction } from "../db/transaction";
import { and, cosineDistance, count, eq, gt, inArray, ne, sql } from "drizzle-orm";
import { db } from "../db/client";
import {
  documentChunks,
  documents,
  docSections,
  documentationSettings,
} from "../db/schema";
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
  kind?: "doc" | "blog" | "changelog";
}) {
  const chunks = extractChunks(input.content as any, input.kind);

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
  publicationId?: string | null;
  policyEpoch?: number;
  revisionId?: string;
  evidenceId?: string;
  url?: string;
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
  const documentationResults = await searchPublishedDocumentation(teamId, query, k);
  const others = await db
    .select({ id: documentChunks.id })
    .from(documentChunks)
    .innerJoin(documents, eq(documentChunks.documentId, documents.id))
    .where(and(eq(documentChunks.teamId, teamId), ne(documents.kind, "doc")))
    .limit(1);
  if (!others.length) return documentationResults;
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
    .where(
      and(
        eq(documentChunks.teamId, teamId),
        ne(documents.kind, "doc"),
        gt(similarity, SIMILARITY_FLOOR),
      ),
    )
    .orderBy((row) => sql`${row.similarity} desc`)
    .limit(k);

  return [...documentationResults, ...rows]
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, k);
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
  expectedDocsDraftVersion: number;
}) {
  return withDbTransaction(async (tx) => {
    const settings = await lockSettings(tx, input.teamId);
    if (settings.source !== "editor")
      throw new DocsContentError([
        diagnostic("SOURCE_REQUIRES_GIT", "This documentation area is owned by Git."),
      ]);
    if (settings.draftVersion !== input.expectedDocsDraftVersion)
      throw new DraftConflict(settings.draftVersion);
    const slug = await uniqueSlug(slugify(input.name), (candidate) =>
      sectionSlugTaken(input.teamId, candidate),
    );
    const [row] = await tx
      .insert(docSections)
      .values({ teamId: input.teamId, name: input.name, slug, order: input.order ?? 0 })
      .returning();
    await tx
      .update(documentationSettings)
      .set({ draftVersion: settings.draftVersion + 1 })
      .where(eq(documentationSettings.teamId, input.teamId));
    return row;
  });
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
  patch: Partial<{ name: string; order: number }> & {
    expectedDocsDraftVersion: number;
  },
) {
  const existing = await getDocSectionBySectionId(teamId, sectionId);
  if (!existing) return null;
  return withDbTransaction(async (tx) => {
    const settings = await lockSettings(tx, teamId);
    if (settings.source !== "editor")
      throw new DocsContentError([
        diagnostic("SOURCE_REQUIRES_GIT", "This documentation area is owned by Git."),
      ]);
    if (settings.draftVersion !== patch.expectedDocsDraftVersion)
      throw new DraftConflict(settings.draftVersion);
    const { expectedDocsDraftVersion, ...fields } = patch;
    const [row] = await tx
      .update(docSections)
      .set({ ...fields, updatedAt: new Date() })
      .where(eq(docSections.id, existing.id))
      .returning();
    await tx
      .update(documentationSettings)
      .set({ draftVersion: settings.draftVersion + 1 })
      .where(eq(documentationSettings.teamId, teamId));
    return row;
  });
}
export async function deleteDocSection(
  teamId: string,
  sectionId: string,
  expectedDocsDraftVersion: number,
) {
  const existing = await getDocSectionBySectionId(teamId, sectionId);
  if (!existing) return { ok: false as const, reason: "not_found" as const };
  return withDbTransaction(async (tx) => {
    const settings = await lockSettings(tx, teamId);
    if (settings.source !== "editor")
      throw new DocsContentError([
        diagnostic("SOURCE_REQUIRES_GIT", "This documentation area is owned by Git."),
      ]);
    if (settings.draftVersion !== expectedDocsDraftVersion)
      throw new DraftConflict(settings.draftVersion);
    await tx.delete(docSections).where(eq(docSections.id, existing.id));
    await tx
      .update(documentationSettings)
      .set({ draftVersion: settings.draftVersion + 1 })
      .where(eq(documentationSettings.teamId, teamId));
    return { ok: true as const };
  });
}

export async function countDocSections(teamId: string) {
  const [{ value }] = await db
    .select({ value: count() })
    .from(docSections)
    .where(eq(docSections.teamId, teamId));
  return value;
}
