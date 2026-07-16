/**
 * Embeddings provider seam (architecture.md §6.1). Two implementations:
 *
 * - `openai`: real OpenAI embeddings API (plain `fetch`, no SDK dependency).
 *   Used when `OPENAI_API_KEY` is set.
 * - `local`: a dependency-free, deterministic hash→vector fallback. Used
 *   when no API key is configured (self-host default, and this repo's own
 *   dev/test environment) so the whole chunk→embed→pgvector-search
 *   pipeline stays exercisable — with real cosine-similarity math against
 *   a real HNSW index — without requiring a paid API key. It has no
 *   semantic understanding of text; swap in a real key for actual RAG
 *   quality.
 *
 * Either way the rest of the app only ever calls `getEmbedding`/
 * `getEmbeddings` — the provider is an implementation detail.
 */
export const EMBEDDING_DIMENSIONS = 1536;

function provider(): "openai" | "local" {
    const configured = process.env.EMBEDDINGS_PROVIDER;
    if (configured === "openai" || configured === "local") return configured;
    return process.env.OPENAI_API_KEY ? "openai" : "local";
}

export async function getEmbedding(text: string): Promise<number[]> {
    const [embedding] = await getEmbeddings([text]);
    return embedding;
}

export async function getEmbeddings(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    return provider() === "openai" ? getOpenAiEmbeddings(texts) : texts.map(getLocalEmbedding);
}

async function getOpenAiEmbeddings(texts: string[]): Promise<number[][]> {
    const apiKey = process.env.OPENAI_API_KEY;
    const model = process.env.EMBEDDINGS_MODEL || "text-embedding-3-small";

    const res = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ model, input: texts }),
    });

    if (!res.ok) {
        const body = await res.text();
        throw new Error(`OpenAI embeddings request failed (${res.status}): ${body}`);
    }

    const json = (await res.json()) as { data: { embedding: number[]; index: number }[] };
    return json.data.sort((a, b) => a.index - b.index).map((item) => item.embedding);
}

/** FNV-1a string hash \u2014 fast, dependency-free, good enough distribution to
 * seed a PRNG for this fallback provider's purposes. */
function hashString(text: string): number {
    let hash = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
}

/** mulberry32 PRNG \u2014 tiny, deterministic, seeded. */
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
    const vector = Array.from({ length: EMBEDDING_DIMENSIONS }, () => random() * 2 - 1);

    // L2-normalize so cosine distance behaves sensibly (matches what a real
    // embeddings provider returns).
    const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
    return vector.map((value) => value / magnitude);
}
