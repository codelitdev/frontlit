import { embedMany } from "ai";
import { createAzure } from "@ai-sdk/azure";
import { createOpenAI } from "@ai-sdk/openai";
import type { ResolvedEmbeddingConfig } from "./queries";

/**
 * Embeddings via Vercel AI SDK Core, always on the team's own key. A team
 * without an embedding key gets keyword (full-text) search only; there is
 * no fake fallback vector.
 *
 * Dimension is fixed at 1536 to match `text-embedding-3-small` and the
 * `search_chunks.embedding` column.
 */
export const EMBEDDING_DIMENSIONS = 1536;

/** Identifies the vector space a stored embedding belongs to. A change
 * (provider or deployment) means stored vectors must be re-embedded. The
 * API key isn't part of it: rotating a key doesn't change the model. */
export function embeddingModelKey(config: ResolvedEmbeddingConfig): string {
  if (config.provider === "azure")
    return `azure:${config.endpoint ?? ""}:${config.deployment || "text-embedding-3-small"}`;
  return "openai:text-embedding-3-small";
}

/** A usable config: has a key (and an endpoint for Azure). */
export function usableEmbeddingConfig(
  config: ResolvedEmbeddingConfig | null | undefined,
): ResolvedEmbeddingConfig | null {
  if (!config?.apiKey) return null;
  if (config.provider === "azure" && !config.endpoint) return null;
  return config;
}

function embeddingModel(config: ResolvedEmbeddingConfig) {
  if (config.provider === "azure") {
    return createAzure({
      apiKey: config.apiKey!,
      baseURL: config.endpoint!,
    }).embedding(config.deployment || "text-embedding-3-small");
  }
  return createOpenAI({ apiKey: config.apiKey! }).embedding("text-embedding-3-small");
}

function validVector(vector: number[]) {
  return (
    vector.length === EMBEDDING_DIMENSIONS &&
    vector.every((n) => Number.isFinite(n)) &&
    vector.some((n) => n !== 0)
  );
}

export async function getEmbeddings(
  texts: string[],
  config: ResolvedEmbeddingConfig,
  timeoutMs = 60_000,
): Promise<{ embeddings: number[][]; usedTokens: number }> {
  if (!texts.length) return { embeddings: [], usedTokens: 0 };
  const result = await embedMany({
    model: embeddingModel(config),
    values: texts,
    maxRetries: 1,
    abortSignal: AbortSignal.timeout(timeoutMs),
  });
  if (
    result.embeddings.length !== texts.length ||
    !result.embeddings.every(validVector)
  )
    throw new Error("The embedding provider returned invalid vectors.");
  return { embeddings: result.embeddings, usedTokens: result.usage?.tokens ?? 0 };
}
