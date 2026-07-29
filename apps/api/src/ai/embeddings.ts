import { embed, embedMany } from "ai";
import { openai } from "@ai-sdk/openai";

/**
 * Embeddings via Vercel AI SDK Core (`embed` / `embedMany`).
 *
 * - `openai`: `@ai-sdk/openai` text embedding model (needs `OPENAI_API_KEY`).
 * - `local`: deterministic hash→vector fallback so RAG/indexing stays
 *   exercisable in tests and self-host without a paid key.
 *
 * Dimension is fixed at 1536 to match `text-embedding-3-small` and the
 * `document_chunks.embedding` column.
 */
export const EMBEDDING_DIMENSIONS = 1536;

export type EmbeddingsProviderName = "openai" | "local";

export function resolveEmbeddingsProvider(): EmbeddingsProviderName {
    const configured = process.env.EMBEDDINGS_PROVIDER?.trim().toLowerCase();
    if (configured === "openai" || configured === "local") return configured;
    return process.env.OPENAI_API_KEY ? "openai" : "local";
}

function embeddingModel() {
    const modelId = process.env.EMBEDDINGS_MODEL || "text-embedding-3-small";
    return openai.embedding(modelId);
}

export async function getEmbedding(text: string): Promise<number[]> {
    if (resolveEmbeddingsProvider() === "local") {
        return getLocalEmbedding(text);
    }
    const { embedding } = await embed({
        model: embeddingModel(),
        value: text,
    });
    return embedding;
}

export async function getEmbeddings(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    if (resolveEmbeddingsProvider() === "local") {
        return texts.map(getLocalEmbedding);
    }
    const { embeddings } = await embedMany({
        model: embeddingModel(),
        values: texts,
    });
    return embeddings;
}

function hashString(text: string): number {
    let hash = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
}

function mulberry32(seed: number) {
    let a = seed;
    return function next() {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function getLocalEmbedding(text: string): number[] {
    const random = mulberry32(hashString(text.trim().toLowerCase()));
    const vector = Array.from(
        { length: EMBEDDING_DIMENSIONS },
        () => random() * 2 - 1,
    );
    const magnitude = Math.sqrt(
        vector.reduce((sum, value) => sum + value * value, 0),
    );
    return vector.map((value) => value / magnitude);
}
