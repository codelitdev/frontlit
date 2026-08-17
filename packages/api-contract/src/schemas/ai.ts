import { z } from "zod";

/** Providers FrontLit can use for a team's AI-powered features. */
export const aiProviders = [
    "openai",
    "azure",
    "anthropic",
    "openrouter",
    "bedrock",
    "opencode",
] as const;
export const aiProviderSchema = z.enum(aiProviders);
export type AiProvider = z.infer<typeof aiProviderSchema>;

/** Each AI feature can select a model independently while sharing a
 * team-level provider credential. */
export const aiModelPurposes = ["chatbot", "grammar", "builder"] as const;
export const aiModelPurposeSchema = z.enum(aiModelPurposes);
export type AiModelPurpose = z.infer<typeof aiModelPurposeSchema>;

export const aiModelSettingsSchema = z.object({
    /** Support chatbot: favour a fast, economical model. */
    chatbot: z.string().nullable(),
    /** Grammar corrections: favour a fast, economical model. */
    grammar: z.string().nullable(),
    /** Page and email generation: favour a more capable model. */
    builder: z.string().nullable(),
});
export type AiModelSettings = z.infer<typeof aiModelSettingsSchema>;

/** Suggested models only; teams may enter any model supported by their provider. */
export const defaultAiModels: Record<AiProvider, AiModelSettings> = {
    openai: {
        chatbot: "gpt-4o-mini",
        grammar: "gpt-4o-mini",
        builder: "gpt-4.1",
    },
    /** Azure model identifiers are deployment names chosen by the team. */
    azure: {
        chatbot: "gpt-4o-mini",
        grammar: "gpt-4o-mini",
        builder: "gpt-4.1",
    },
    anthropic: {
        chatbot: "claude-haiku-4-5-20251001",
        grammar: "claude-haiku-4-5-20251001",
        builder: "claude-sonnet-4-5-20250929",
    },
    openrouter: {
        chatbot: "openai/gpt-4o-mini",
        grammar: "openai/gpt-4o-mini",
        builder: "openai/gpt-4.1",
    },
    bedrock: {
        chatbot: "anthropic.claude-3-5-haiku-20241022-v1:0",
        grammar: "anthropic.claude-3-5-haiku-20241022-v1:0",
        builder: "anthropic.claude-3-7-sonnet-20250219-v1:0",
    },
    opencode: {
        chatbot: "openai/gpt-5.1",
        grammar: "openai/gpt-5.1",
        builder: "openai/gpt-5.1",
    },
};

export const embeddingProviders = ["openai", "azure"] as const;
export const embeddingProviderSchema = z.enum(embeddingProviders);
export type EmbeddingProvider = z.infer<typeof embeddingProviderSchema>;

const embeddingConfigSchema = z.object({
    provider: embeddingProviderSchema,
    deployment: z.string().nullable(),
    endpoint: z.string().nullable(),
    hasApiKey: z.boolean(),
});

export const aiIndexContentSchema = z.object({
    articles: z.boolean(),
    changelog: z.boolean(),
});
export type AiIndexContent = z.infer<typeof aiIndexContentSchema>;

/** Credentials are write-only. The API only reports whether one is stored. */
export const aiConfigSchema = z.object({
    provider: aiProviderSchema,
    models: aiModelSettingsSchema,
    region: z.string().nullable(),
    endpoint: z.string().nullable(),
    hasApiKey: z.boolean(),
    embedding: embeddingConfigSchema.nullable(),
    indexContent: aiIndexContentSchema,
    createdAt: z.string().nullable(),
    updatedAt: z.string().nullable(),
});

export const updateAiConfigBodySchema = z
    .object({
        provider: aiProviderSchema,
        /** Omitted purposes retain their current model selection. */
        models: aiModelSettingsSchema
            .partial()
            .extend({
                chatbot: z.string().trim().max(160).nullable().optional(),
                grammar: z.string().trim().max(160).nullable().optional(),
                builder: z.string().trim().max(160).nullable().optional(),
            })
            .optional(),
        /** Required for Bedrock requests when using a bearer API key. */
        region: z.string().trim().max(80).optional(),
        /** Azure OpenAI resource endpoint, including `/openai`. */
        endpoint: z.string().url().max(500).optional(),
        /** Omit to retain the currently stored key. */
        apiKey: z.string().trim().min(1).max(4096).optional(),
        embedding: z
            .object({
                provider: embeddingProviderSchema,
                /** Omit to retain the stored embedding credential. */
                apiKey: z.string().trim().min(1).max(4096).optional(),
                /** Azure deployment name; defaults to text-embedding-3-small. */
                deployment: z.string().trim().max(160).optional(),
                /** Azure OpenAI resource endpoint, including `/openai`. */
                endpoint: z.string().url().max(500).optional(),
            })
            .optional(),
        indexContent: aiIndexContentSchema.partial().optional(),
    })
    .superRefine((value, ctx) => {
        if (value.provider === "bedrock" && !value.region?.trim()) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["region"],
                message: "Amazon Bedrock requires an AWS region.",
            });
        }
        if (value.provider === "azure" && !value.endpoint?.trim()) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["endpoint"],
                message: "Azure OpenAI requires a resource endpoint.",
            });
        }
        if (
            value.embedding?.provider === "azure" &&
            !value.embedding.endpoint
        ) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["embedding", "endpoint"],
                message: "Azure OpenAI embeddings require a resource endpoint.",
            });
        }
    });
