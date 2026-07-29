/** Server-side Vercel AI SDK wiring (chat models + embeddings). */
export {
    describeChatProvider,
    getChatLanguageModel,
    resolveChatModelId,
    resolveChatProvider,
    type ChatProviderName,
} from "./provider";
export {
    EMBEDDING_DIMENSIONS,
    getEmbedding,
    getEmbeddings,
    resolveEmbeddingsProvider,
    type EmbeddingsProviderName,
} from "./embeddings";
