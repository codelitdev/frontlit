import { createHash } from "node:crypto";
import {
  and,
  asc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  or,
  sql,
} from "drizzle-orm";
import { db } from "../db/client";
import {
  documentationApiOperations,
  documentationSettings,
  documents,
  searchChunks,
  searchIndexRequests,
  type SearchSourceKind,
} from "../db/schema";
import { readDocumentation } from "../documentation/publications";
import { extractChunks } from "../documentation/chunking";
import { teamIndexesKind } from "../documentation/index-policy";
import { getActiveRelease } from "../pages/releases";
import { getResolvedEmbeddingConfig } from "../ai/queries";
import {
  embeddingModelKey,
  getEmbeddings,
  usableEmbeddingConfig,
} from "../ai/embeddings";
import {
  chargeReservation,
  releaseReservation,
  reserveTokens,
} from "../inbox-ai/usage";
import { logger } from "../services/log";
import { incrementCounter } from "../services/metrics";
import { chunkContext, extractPageChunks, type ExtractedChunk } from "./extract";

export { requestSearchIndex } from "./requests";

/** Bump when extraction or context changes so every source is rebuilt. */
const INDEX_VERSION = 1;
const LEASE_MS = 5 * 60_000;
const EMBED_BATCH = 64;
const EMBED_PER_PASS = 512;

export interface IndexSource {
  kind: SearchSourceKind;
  sourceId: string;
  revisionId: string | null;
  slug: string;
  title: string | null;
  context: string;
  chunks: ExtractedChunk[];
  hash: string;
}

function digest(value: unknown) {
  return createHash("sha256")
    .update(JSON.stringify([INDEX_VERSION, value]))
    .digest("hex");
}

function source(input: Omit<IndexSource, "hash">, identity: unknown): IndexSource {
  return { ...input, hash: digest([input.slug, input.title, input.context, identity]) };
}

/** Everything a team has published that search may return, with the text
 * to index. */
export async function desiredSources(teamId: string): Promise<IndexSource[]> {
  const sources: IndexSource[] = [];

  const docsSettings = await db.query.documentationSettings.findFirst({
    where: eq(documentationSettings.teamId, teamId),
  });
  const live = await readDocumentation(teamId);
  if (live.indexing.enabled) {
    const sections = new Map(
      live.sections.map((section: any) => [section.sectionId, section.name]),
    );
    for (const item of live.items) {
      if (item.meta?.indexable === false) continue;
      const context = chunkContext({
        label: "Docs",
        title: item.title,
        section: sections.get(item.meta?.sectionId) ?? null,
        summary: item.excerpt ?? item.meta?.description ?? null,
      });
      sources.push(
        source(
          {
            kind: "doc",
            sourceId: item.documentId,
            revisionId: item.revisionId,
            slug: item.slug,
            title: item.title,
            context,
            chunks: item._chunks ?? [],
          },
          item.revisionId,
        ),
      );
    }
  }
  if (docsSettings?.activeApiSpecId && docsSettings.indexing?.enabled !== false) {
    const operations = await db
      .select()
      .from(documentationApiOperations)
      .where(eq(documentationApiOperations.specId, docsSettings.activeApiSpecId));
    for (const operation of operations) {
      sources.push(
        source(
          {
            kind: "api-operation",
            sourceId: operation.route,
            revisionId: operation.specId,
            slug: operation.route,
            title: operation.title,
            context: chunkContext({
              label: "API reference",
              title: `${operation.method.toUpperCase()} ${operation.path}`,
              section: operation.group,
            }),
            chunks: operation.chunks,
          },
          operation.specId,
        ),
      );
    }
  }

  const release = await getActiveRelease(teamId);
  for (const page of release?.pages ?? []) {
    const content = page.revision.content;
    if (content.robotsAllowed === false) continue;
    const title = content.title || page.name;
    sources.push(
      source(
        {
          kind: "page",
          sourceId: page.slug,
          revisionId: page.revisionId,
          slug: page.slug,
          title,
          context: chunkContext({
            label: "Page",
            title,
            summary: content.description ?? null,
          }),
          chunks: extractPageChunks(content),
        },
        page.revisionId,
      ),
    );
  }

  for (const kind of ["blog", "changelog"] as const) {
    if (!(await teamIndexesKind(teamId, kind))) continue;
    const rows = await db
      .select()
      .from(documents)
      .where(
        and(
          eq(documents.teamId, teamId),
          eq(documents.kind, kind),
          isNotNull(documents.publishedAt),
        ),
      );
    for (const row of rows) {
      if ((row.meta as { indexable?: unknown })?.indexable === false) continue;
      const version = (row.meta as { version?: unknown })?.version;
      sources.push(
        source(
          {
            kind,
            sourceId: row.documentId,
            revisionId: null,
            slug: row.slug,
            title: row.title,
            context: chunkContext({
              label: kind === "blog" ? "Blog" : "Changelog",
              title: row.title,
              section: typeof version === "string" ? version : null,
              summary: row.excerpt,
            }),
            chunks: extractChunks(row.content, kind),
          },
          row.content,
        ),
      );
    }
  }
  return sources;
}

/** Rewrites the chunks of changed sources and drops sources that are no
 * longer published. Returns how many sources changed. */
export async function syncSearchChunks(teamId: string) {
  const desired = await desiredSources(teamId);
  const existing = await db
    .selectDistinct({
      kind: searchChunks.kind,
      sourceId: searchChunks.sourceId,
      sourceHash: searchChunks.sourceHash,
    })
    .from(searchChunks)
    .where(eq(searchChunks.teamId, teamId));
  const key = (kind: string, sourceId: string) => `${kind}\u0000${sourceId}`;
  const current = new Map<string, Set<string>>();
  for (const row of existing) {
    const k = key(row.kind, row.sourceId);
    current.set(k, (current.get(k) ?? new Set()).add(row.sourceHash));
  }
  const wanted = new Set(desired.map((s) => key(s.kind, s.sourceId)));
  let changed = 0;

  for (const item of desired) {
    const hashes = current.get(key(item.kind, item.sourceId));
    if (hashes?.size === 1 && hashes.has(item.hash)) continue;
    // Nothing to index (e.g. a page of only forms) and nothing stored.
    if (!hashes && !item.chunks.some((chunk) => chunk.content.trim())) continue;
    changed++;
    await db.transaction(async (tx) => {
      await tx
        .delete(searchChunks)
        .where(
          and(
            eq(searchChunks.teamId, teamId),
            eq(searchChunks.kind, item.kind),
            eq(searchChunks.sourceId, item.sourceId),
          ),
        );
      const rows = item.chunks.filter((chunk) => chunk.content.trim());
      if (!rows.length) return;
      await tx.insert(searchChunks).values(
        rows.map((chunk, position) => ({
          teamId,
          kind: item.kind,
          sourceId: item.sourceId,
          revisionId: item.revisionId,
          sourceHash: item.hash,
          position,
          slug: item.slug,
          title: item.title,
          heading: chunk.heading,
          anchor: chunk.anchor,
          context: item.context,
          content: chunk.content,
        })),
      );
    });
  }

  for (const [k] of current) {
    if (wanted.has(k)) continue;
    const [kind, sourceId] = k.split("\u0000") as [SearchSourceKind, string];
    changed++;
    await db
      .delete(searchChunks)
      .where(
        and(
          eq(searchChunks.teamId, teamId),
          eq(searchChunks.kind, kind),
          eq(searchChunks.sourceId, sourceId),
        ),
      );
  }
  return changed;
}

export function embeddingInput(row: {
  context: string;
  heading: string | null;
  content: string;
}) {
  return [row.context, row.heading, row.content].filter(Boolean).join("\n\n");
}

/** Embeds chunks that lack a vector for the team's current embedding
 * model. Returns true when more remain (the worker comes back). */
export async function embedSearchChunks(teamId: string): Promise<boolean> {
  const config = usableEmbeddingConfig(await getResolvedEmbeddingConfig(teamId));
  if (!config) {
    await db
      .update(searchChunks)
      .set({ embedding: null, embeddingModel: null })
      .where(
        and(eq(searchChunks.teamId, teamId), isNotNull(searchChunks.embeddingModel)),
      );
    return false;
  }
  const model = embeddingModelKey(config);
  let done = 0;
  while (done < EMBED_PER_PASS) {
    const rows = await db
      .select({
        id: searchChunks.id,
        context: searchChunks.context,
        heading: searchChunks.heading,
        content: searchChunks.content,
      })
      .from(searchChunks)
      .where(
        and(
          eq(searchChunks.teamId, teamId),
          or(
            isNull(searchChunks.embeddingModel),
            sql`${searchChunks.embeddingModel} <> ${model}`,
          ),
        ),
      )
      .limit(EMBED_BATCH);
    if (!rows.length) return false;
    const texts = rows.map((row) => embeddingInput(row).slice(0, 8000));
    const estimated = Math.max(
      1,
      texts.reduce((n, text) => n + Math.ceil(text.length / 4), 0),
    );
    if (!(await reserveTokens(teamId, estimated)))
      throw new Error("AI budget exhausted; embeddings resume after it renews.");
    let used = estimated;
    let called = false;
    try {
      called = true;
      const result = await getEmbeddings(texts, config);
      used = result.usedTokens || estimated;
      for (const [index, row] of rows.entries()) {
        await db
          .update(searchChunks)
          .set({ embedding: result.embeddings[index], embeddingModel: model })
          .where(eq(searchChunks.id, row.id));
      }
    } finally {
      if (called) await chargeReservation(teamId, estimated, used);
      else await releaseReservation(teamId, estimated);
    }
    done += rows.length;
  }
  return true;
}

export async function claimSearchIndexRequest() {
  const now = new Date();
  const due = and(
    lte(searchIndexRequests.nextAttemptAt, now),
    or(
      isNull(searchIndexRequests.leaseExpiresAt),
      lte(searchIndexRequests.leaseExpiresAt, now),
    ),
  );
  const [next] = await db
    .select()
    .from(searchIndexRequests)
    .where(due)
    .orderBy(asc(searchIndexRequests.nextAttemptAt))
    .limit(1);
  if (!next) return null;
  const [claimed] = await db
    .update(searchIndexRequests)
    .set({ leaseExpiresAt: new Date(Date.now() + LEASE_MS) })
    .where(and(eq(searchIndexRequests.teamId, next.teamId), due))
    .returning();
  return claimed ?? null;
}

/** Processes one team's request. Returns false when nothing was due. */
export async function processOneSearchIndexRequest(): Promise<boolean> {
  // Requests made from here on describe changes this pass may miss.
  const startedAt = new Date();
  const request = await claimSearchIndexRequest();
  if (!request) return false;
  const { teamId } = request;
  try {
    const changed = await syncSearchChunks(teamId);
    const more = await embedSearchChunks(teamId);
    if (more) {
      await db
        .update(searchIndexRequests)
        .set({ leaseExpiresAt: null, nextAttemptAt: new Date(), lastError: null })
        .where(eq(searchIndexRequests.teamId, teamId));
    } else {
      // A request that arrived while this pass ran keeps its row.
      const deleted = await db
        .delete(searchIndexRequests)
        .where(
          and(
            eq(searchIndexRequests.teamId, teamId),
            lt(searchIndexRequests.requestedAt, startedAt),
          ),
        )
        .returning();
      if (!deleted.length)
        await db
          .update(searchIndexRequests)
          .set({ leaseExpiresAt: null, lastError: null })
          .where(eq(searchIndexRequests.teamId, teamId));
    }
    incrementCounter("search_index_runs_total", { event: "done" });
    if (changed) logger.info({ teamId, changed }, "Search index updated");
  } catch (error) {
    const lastError = error instanceof Error ? error.message : String(error);
    const attempts = request.attempts + 1;
    await db
      .update(searchIndexRequests)
      .set({
        attempts,
        lastError: lastError.slice(0, 500),
        leaseExpiresAt: null,
        nextAttemptAt: new Date(Date.now() + Math.min(600_000, 5_000 * 2 ** attempts)),
      })
      .where(eq(searchIndexRequests.teamId, teamId));
    incrementCounter("search_index_runs_total", { event: "failed" });
    logger.warn({ teamId, error: lastError }, "Search index run failed");
  }
  return true;
}

/** Runs pending requests until none are due. Used by tests and scripts. */
export async function drainSearchIndex(limit = 50) {
  for (let i = 0; i < limit; i++) if (!(await processOneSearchIndexRequest())) return;
}

export function startSearchIndexWorker(intervalMs = 2000): () => void {
  let stopped = false;
  async function tick() {
    if (stopped) return;
    try {
      while (!stopped && (await processOneSearchIndexRequest())) {}
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        "Search index worker tick failed",
      );
    }
    if (!stopped) setTimeout(tick, intervalMs);
  }
  setTimeout(tick, intervalMs);
  return () => {
    stopped = true;
  };
}

/** Index state of published blog/changelog entries, for the editors. */
export async function searchIndexStateFor(
  teamId: string,
  kind: SearchSourceKind,
  sourceIds: string[],
) {
  if (!sourceIds.length) return { indexed: new Set<string>(), request: null };
  const [rows, request] = await Promise.all([
    db
      .selectDistinct({ sourceId: searchChunks.sourceId })
      .from(searchChunks)
      .where(
        and(
          eq(searchChunks.teamId, teamId),
          eq(searchChunks.kind, kind),
          inArray(searchChunks.sourceId, sourceIds),
        ),
      ),
    db.query.searchIndexRequests.findFirst({
      where: eq(searchIndexRequests.teamId, teamId),
    }),
  ]);
  return {
    indexed: new Set(rows.map((row) => row.sourceId)),
    request: request ?? null,
  };
}
