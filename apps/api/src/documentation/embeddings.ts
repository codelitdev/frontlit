/**
 * Re-export embeddings from the shared AI SDK module so documentation /
 * RAG code keeps importing from here while all provider I/O lives under
 * `src/ai/` (Vercel AI SDK Core).
 */
export { EMBEDDING_DIMENSIONS, getEmbedding, getEmbeddings, resolveEmbeddingsProvider } from "../ai/embeddings";
