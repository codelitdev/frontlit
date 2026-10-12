import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import {
  documentationEmbeddingConfigs as configs,
  documentationEmbeddings as vectors,
  documentationSettings as settings,
  documentationPublications as publications,
} from "../db/schema";
import { getResolvedEmbeddingConfig } from "../ai/queries";
import { getRealEmbeddings } from "../ai/embeddings";
import { decryptSecret, encryptSecret } from "../utils/crypto";
import {
  reserveTokens,
  chargeReservation,
  releaseReservation,
} from "../inbox-ai/usage";
import { DocsContentError, diagnostic } from "@frontlit/text-editor/docs";

function failure(code: string, message: string): never {
  throw new DocsContentError([diagnostic(code, message)]);
}
export async function captureRetrievalConfiguration(
  teamId: string,
  indexing: { enabled: boolean; mode?: string },
  executor: any = db,
) {
  if (!indexing.enabled || indexing.mode !== "semantic")
    return { enabled: indexing.enabled, mode: "lexical" as const };
  const config = await getResolvedEmbeddingConfig(teamId, executor);
  if (!config?.apiKey || (config.provider === "azure" && !config.endpoint))
    return { enabled: true, mode: "semantic" as const, configHash: null };
  const configHash = createHash("sha256")
    .update(JSON.stringify([teamId, config]))
    .digest("hex");
  await executor
    .insert(configs)
    .values({
      teamId,
      configHash,
      provider: config.provider,
      deployment: config.deployment,
      endpoint: config.endpoint,
      encryptedApiKey: encryptSecret(config.apiKey),
    })
    .onConflictDoNothing();
  return { enabled: true, mode: "semantic" as const, configHash };
}
async function resolved(teamId: string, configHash?: string | null) {
  const config = configHash
    ? await db.query.documentationEmbeddingConfigs.findFirst({
        where: and(eq(configs.teamId, teamId), eq(configs.configHash, configHash)),
      })
    : null;
  if (!config)
    failure(
      "EMBEDDING_CONFIGURATION_REQUIRED",
      "Configure a real embedding provider before preparing semantic retrieval.",
    );
  return {
    provider: config.provider,
    deployment: config.deployment,
    endpoint: config.endpoint,
    apiKey: decryptSecret(config.encryptedApiKey),
  };
}
export async function prepareDocumentationRetrieval(
  job: {
    teamId: string;
    publicationId?: string;
    generation?: number;
    purgeGeneration?: number;
    leaseToken?: string | null;
    indexing: { enabled: boolean; mode?: string; configHash?: string | null };
  },
  revisions: any[],
) {
  if (!job.indexing.enabled || job.indexing.mode !== "semantic") return;
  const config = await resolved(job.teamId, job.indexing.configHash);
  let preparedCount = 0;
  for (const revision of revisions) {
    if (revision.snapshot.draftMeta.indexable === false) continue;
    const exists = await db.query.documentationEmbeddings.findFirst({
      where: and(
        eq(vectors.revisionId, revision.revisionId),
        eq(vectors.configHash, job.indexing.configHash!),
      ),
    });
    if (exists) continue;
    if (job.publicationId) {
      const current = await db.query.documentationSettings.findFirst({
        where: eq(settings.teamId, job.teamId),
      });
      if (
        current?.requestedGeneration !== job.generation ||
        current?.purgeGeneration !== job.purgeGeneration
      )
        failure(
          "SUPERSEDED_GENERATION",
          "A newer documentation generation replaced this preparation.",
        );
      const refreshed = await db
        .update(publications)
        .set({ leaseExpiresAt: new Date(Date.now() + 120000) })
        .where(
          and(
            eq(publications.publicationId, job.publicationId),
            eq(publications.leaseToken, job.leaseToken!),
          ),
        )
        .returning();
      if (!refreshed.length)
        failure("SUPERSEDED_GENERATION", "The preparation lease was replaced.");
    }
    if (preparedCount >= 5)
      failure(
        "PREPARATION_PROGRESS",
        "Preparation will continue in the next worker pass.",
      );
    const texts = revision.chunks.map((c: any) => c.content) as string[];
    const estimated = Math.max(
      1,
      texts.reduce((n, t) => n + Math.ceil(t.length / 4), 0),
    );
    if (!(await reserveTokens(job.teamId, estimated)))
      failure(
        "BUDGET_EXHAUSTED",
        "AI budget exhausted. Retry this candidate after budget renewal.",
      );
    let called = false;
    let used = estimated;
    try {
      called = true;
      const result = await getRealEmbeddings(texts, config);
      const embedded = result.embeddings;
      used = result.usedTokens;
      if (
        embedded.length !== texts.length ||
        embedded.some(
          (v) =>
            v.length !== 1536 ||
            v.some((n) => !Number.isFinite(n)) ||
            !v.some((n) => n !== 0),
        )
      )
        failure(
          "INVALID_EMBEDDINGS",
          "The embedding provider returned invalid vectors.",
        );
      preparedCount++;
      await db
        .insert(vectors)
        .values({
          revisionId: revision.revisionId,
          configHash: job.indexing.configHash!,
          vectors: embedded,
        })
        .onConflictDoNothing();
    } finally {
      if (called) await chargeReservation(job.teamId, estimated, used);
      else await releaseReservation(job.teamId, estimated);
    }
  }
}
export async function semanticDocumentationScores(
  teamId: string,
  configHash: string | null | undefined,
  query: string,
  items: any[],
) {
  if (!items.length) return new Map<string, number[]>();
  const config = await resolved(teamId, configHash);
  const estimate = Math.max(1, Math.ceil(query.length / 4));
  if (!(await reserveTokens(teamId, estimate)))
    failure(
      "BUDGET_EXHAUSTED",
      "AI budget exhausted. Try lexical search or contact support.",
    );
  let embedding: number[];
  let used = estimate;
  try {
    const result = await getRealEmbeddings([query], config);
    embedding = result.embeddings[0];
    used = result.usedTokens;
  } finally {
    await chargeReservation(teamId, estimate, used);
  }
  const norm = (a: number[]) => Math.sqrt(a.reduce((n, v) => n + v * v, 0));
  if (
    !embedding ||
    embedding.length !== 1536 ||
    !norm(embedding) ||
    embedding.some((v) => !Number.isFinite(v))
  )
    failure(
      "INVALID_EMBEDDINGS",
      "The embedding provider returned an invalid query vector.",
    );
  const scores = new Map<string, number[]>();
  for (const item of items) {
    const stored = await db.query.documentationEmbeddings.findFirst({
      where: and(
        eq(vectors.revisionId, item.revisionId),
        eq(vectors.configHash, configHash!),
      ),
    });
    if (!stored)
      failure("RETRIEVAL_UNAVAILABLE", "The live semantic corpus is unavailable.");
    scores.set(
      item.revisionId,
      stored.vectors.map(
        (v) =>
          v.reduce((n, value, i) => n + value * embedding[i], 0) /
          (norm(v) * norm(embedding)),
      ),
    );
  }
  return scores;
}
