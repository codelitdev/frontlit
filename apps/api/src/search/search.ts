import { and, cosineDistance, eq, inArray, sql, type SQL } from "drizzle-orm";
import { publicContentPath } from "@frontlit/api-contract";
import { db } from "../db/client";
import {
  documentationSettings,
  searchChunks,
  type SearchSourceKind,
} from "../db/schema";
import { readDocumentation } from "../documentation/publications";
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
import { siteOriginForTeam } from "../utils/site-url";
import { logger } from "../services/log";

export interface SearchResult {
  documentId: string;
  slug: string;
  title: string | null;
  heading: string | null;
  anchor: string | null;
  content: string;
  /** 0–1 relevance from rank fusion (1 = top of every list). */
  similarity: number;
  kind: SearchSourceKind;
  publicationId?: string | null;
  policyEpoch?: number;
  revisionId?: string;
  evidenceId?: string;
  url?: string;
}

/** Reciprocal rank fusion constant; 60 is the usual default. */
const RRF_K = 60;
/** Cosine similarity below this isn't treated as a vector match. */
const VECTOR_FLOOR = 0.25;
const MAX_QUERY_TOKENS = 32;

type Row = typeof searchChunks.$inferSelect;

/** OR of the query's words (prefix-matched when 3+ characters), so a
 * chunk matching most words ranks above one matching a few, and a chunk
 * missing one word still matches. */
export function toTsQuery(query: string): string | null {
  const tokens = [...new Set(query.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])].slice(
    0,
    MAX_QUERY_TOKENS,
  );
  if (!tokens.length) return null;
  return tokens.map((token) => (token.length >= 3 ? `${token}:*` : token)).join(" | ");
}

/** Fuses ranked lists; items in several lists, or high in one, win. */
export function reciprocalRankFusion<T>(lists: T[][], key: (item: T) => string) {
  const scores = new Map<string, { item: T; score: number }>();
  for (const list of lists) {
    list.forEach((item, index) => {
      const k = key(item);
      const entry = scores.get(k) ?? { item, score: 0 };
      entry.score += 1 / (RRF_K + index + 1);
      scores.set(k, entry);
    });
  }
  const best = lists.filter((list) => list.length).length / (RRF_K + 1);
  return [...scores.values()]
    .sort((a, b) => b.score - a.score)
    .map(({ item, score }) => ({ item, similarity: best ? score / best : 0 }));
}

/** What is live right now. Search only returns chunks from these, so an
 * index that lags behind a publish/unpublish never leaks old content. */
async function liveScope(teamId: string) {
  const [live, settings, release] = await Promise.all([
    readDocumentation(teamId),
    db.query.documentationSettings.findFirst({
      where: eq(documentationSettings.teamId, teamId),
    }),
    getActiveRelease(teamId),
  ]);
  const docRevisions = live.indexing.enabled
    ? live.items.filter((i) => i.meta?.indexable !== false).map((i) => i.revisionId)
    : [];
  const pages = (release?.pages ?? []).filter(
    (page) => page.revision.content.robotsAllowed !== false,
  );
  const articleKinds: SearchSourceKind[] = [];
  for (const kind of ["blog", "changelog"] as const)
    if (await teamIndexesKind(teamId, kind)) articleKinds.push(kind);

  const conditions: SQL[] = [];
  if (docRevisions.length)
    conditions.push(
      and(
        eq(searchChunks.kind, "doc"),
        inArray(searchChunks.revisionId, docRevisions),
      )!,
    );
  if (settings?.activeApiSpecId && settings.indexing?.enabled !== false)
    conditions.push(
      and(
        eq(searchChunks.kind, "api-operation"),
        eq(searchChunks.revisionId, settings.activeApiSpecId),
      )!,
    );
  if (pages.length)
    conditions.push(
      and(
        eq(searchChunks.kind, "page"),
        inArray(
          searchChunks.revisionId,
          pages.map((page) => page.revisionId),
        ),
        inArray(
          searchChunks.sourceId,
          pages.map((page) => page.slug),
        ),
      )!,
    );
  if (articleKinds.length)
    conditions.push(
      and(
        inArray(searchChunks.kind, articleKinds),
        sql`exists (select 1 from documents d where d.team_id = ${searchChunks.teamId} and d.document_id = ${searchChunks.sourceId} and d.published_at is not null and coalesce(d.meta->>'indexable', 'true') <> 'false')`,
      )!,
    );
  return { live, conditions };
}

async function keywordMatches(
  teamId: string,
  scope: SQL,
  query: string,
  limit: number,
) {
  const tsquery = toTsQuery(query);
  if (!tsquery) return [];
  const q = sql`to_tsquery('english', ${tsquery})`;
  return db
    .select()
    .from(searchChunks)
    .where(
      and(
        eq(searchChunks.teamId, teamId),
        scope,
        sql`${searchChunks.searchText} @@ ${q}`,
      ),
    )
    .orderBy(sql`ts_rank_cd(${searchChunks.searchText}, ${q}) desc`)
    .limit(limit);
}

async function vectorMatches(
  teamId: string,
  scope: SQL,
  query: string,
  limit: number,
): Promise<Row[]> {
  const config = usableEmbeddingConfig(await getResolvedEmbeddingConfig(teamId));
  if (!config) return [];
  const model = embeddingModelKey(config);
  const embedded = await db
    .select({ id: searchChunks.id })
    .from(searchChunks)
    .where(and(eq(searchChunks.teamId, teamId), eq(searchChunks.embeddingModel, model)))
    .limit(1);
  if (!embedded.length) return [];

  const estimate = Math.max(1, Math.ceil(query.length / 4));
  if (!(await reserveTokens(teamId, estimate))) return [];
  let used = estimate;
  let vector: number[];
  try {
    const result = await getEmbeddings([query.slice(0, 2000)], config, 10_000);
    vector = result.embeddings[0];
    used = result.usedTokens || estimate;
  } catch (error) {
    await releaseReservation(teamId, estimate);
    logger.warn(
      { teamId, error: error instanceof Error ? error.message : String(error) },
      "Query embedding failed; using keyword search only",
    );
    return [];
  }
  await chargeReservation(teamId, estimate, used);
  const distance = cosineDistance(searchChunks.embedding, vector);
  return db
    .select()
    .from(searchChunks)
    .where(
      and(
        eq(searchChunks.teamId, teamId),
        eq(searchChunks.embeddingModel, model),
        scope,
        sql`1 - (${distance}) > ${VECTOR_FLOOR}`,
      ),
    )
    .orderBy(distance)
    .limit(limit);
}

/**
 * Hybrid retrieval over everything a team has published: Postgres
 * full-text search always, plus vector search when the team has an
 * embedding key, merged with reciprocal rank fusion. Returns up to `limit`
 * chunks, best first.
 */
export async function searchContent(
  teamId: string,
  query: string,
  limit = 6,
): Promise<SearchResult[]> {
  const { live, conditions } = await liveScope(teamId);
  if (!conditions.length || !query.trim()) return [];
  const scope = sql.join(
    conditions.map((condition) => sql`(${condition})`),
    sql` or `,
  );
  const scoped = sql`(${scope})`;
  const pool = Math.max(limit, 30);
  const [keyword, vector] = await Promise.all([
    keywordMatches(teamId, scoped, query, pool),
    vectorMatches(teamId, scoped, query, pool),
  ]);
  const fused = reciprocalRankFusion([keyword, vector], (row) => row.id).slice(
    0,
    limit,
  );
  if (!fused.length) return [];

  const origin = await siteOriginForTeam(teamId);
  return fused.map(({ item: row, similarity }) => {
    // Changelog entries are one page; link to the entry, not a heading.
    const anchor = row.kind === "changelog" ? null : row.anchor;
    const result: SearchResult = {
      documentId: row.sourceId,
      slug: row.slug,
      title: row.title,
      heading: row.heading,
      anchor,
      content: row.content,
      similarity,
      kind: row.kind,
      url: `${origin}${publicContentPath(row.kind, row.slug, anchor)}`,
    };
    if (row.kind === "doc" && row.revisionId)
      Object.assign(result, {
        publicationId: live.publicationId,
        policyEpoch: live.policyEpoch,
        revisionId: row.revisionId,
        evidenceId: `${row.revisionId}:${row.position}`,
      });
    return result;
  });
}
