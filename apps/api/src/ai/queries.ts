import { eq } from "drizzle-orm";
import type {
    AiModelSettings,
    AiProvider,
    EmbeddingProvider,
} from "@frontlit/api-contract";
import { db } from "../db/client";
import { aiSettings } from "../db/schema";
import { enqueuePublishedDocsForTeam } from "../documentation/index-jobs";
import { deleteChunksForTeamKind } from "../documentation/queries";
import { decryptSecret, encryptSecret } from "../utils/crypto";

type AiSettingsRow = typeof aiSettings.$inferSelect;

export type PublicAiConfig = {
    provider: AiProvider;
    models: AiModelSettings;
    region: string | null;
    endpoint: string | null;
    hasApiKey: boolean;
    embedding: {
        provider: EmbeddingProvider;
        deployment: string | null;
        endpoint: string | null;
        hasApiKey: boolean;
    } | null;
    indexContent: { articles: boolean; changelog: boolean };
    createdAt: Date;
    updatedAt: Date;
};

export type ResolvedAiConfig = {
    provider: AiProvider;
    models: AiModelSettings;
    region: string | null;
    endpoint: string | null;
    apiKey: string | null;
};

export type ResolvedEmbeddingConfig = {
    provider: EmbeddingProvider;
    apiKey: string | null;
    deployment: string | null;
    endpoint: string | null;
};

function asProvider(value: string): AiProvider {
    // The database enum is constrained by the app schema; this cast keeps the
    // public contract's source of truth in one place.
    return value as AiProvider;
}

function asEmbeddingProvider(value: string): EmbeddingProvider {
    return value as EmbeddingProvider;
}

function modelsFromRow(row: AiSettingsRow): AiModelSettings {
    return {
        // Existing team settings used a single `model`; use it for the
        // chatbot until migration 0008 has copied it to model_settings.
        chatbot: row.modelSettings?.chatbot ?? row.model,
        grammar: row.modelSettings?.grammar ?? null,
        builder: row.modelSettings?.builder ?? null,
    };
}

function toPublic(row: AiSettingsRow): PublicAiConfig {
    return {
        provider: asProvider(row.provider),
        models: modelsFromRow(row),
        region: row.region,
        endpoint: row.azureEndpoint,
        hasApiKey: Boolean(row.encryptedApiKey),
        embedding: row.embeddingProvider
            ? {
                  provider: asEmbeddingProvider(row.embeddingProvider),
                  deployment: row.embeddingDeployment,
                  endpoint: row.embeddingEndpoint,
                  hasApiKey: Boolean(row.encryptedEmbeddingApiKey),
              }
            : null,
        indexContent: {
            articles: row.indexArticles,
            changelog: row.indexChangelog,
        },
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
}

export async function getResolvedEmbeddingConfig(
    teamId: string,
): Promise<ResolvedEmbeddingConfig | null> {
    const row = await db.query.aiSettings.findFirst({
        where: eq(aiSettings.teamId, teamId),
    });
    if (!row) return null;
    // OpenAI and Azure OpenAI reuse the selected chat provider's credential.
    // Azure's embedding deployment is conventionally named after the model.
    // This avoids storing the same key twice or asking a team to configure
    // embeddings after it has already selected either provider for chat.
    if (
        (row.provider === "openai" || row.provider === "azure") &&
        row.encryptedApiKey
    ) {
        if (row.provider === "openai") {
            return {
                provider: "openai",
                apiKey: decryptSecret(row.encryptedApiKey),
                deployment: null,
                endpoint: null,
            };
        }
        if (row.azureEndpoint) {
            return {
                provider: "azure",
                apiKey: decryptSecret(row.encryptedApiKey),
                deployment: "text-embedding-3-small",
                endpoint: row.azureEndpoint,
            };
        }
    }
    if (!row.embeddingProvider) {
        return null;
    }
    return {
        provider: asEmbeddingProvider(row.embeddingProvider),
        apiKey: row.encryptedEmbeddingApiKey
            ? decryptSecret(row.encryptedEmbeddingApiKey)
            : null,
        deployment: row.embeddingDeployment,
        endpoint: row.embeddingEndpoint,
    };
}

export async function getAiConfig(
    teamId: string,
): Promise<PublicAiConfig | null> {
    const row = await db.query.aiSettings.findFirst({
        where: eq(aiSettings.teamId, teamId),
    });
    return row ? toPublic(row) : null;
}

/** Internal-only configuration containing a decrypted key for model creation. */
export async function getResolvedAiConfig(
    teamId: string,
): Promise<ResolvedAiConfig | null> {
    const row = await db.query.aiSettings.findFirst({
        where: eq(aiSettings.teamId, teamId),
    });
    if (!row) return null;
    return {
        provider: asProvider(row.provider),
        models: modelsFromRow(row),
        region: row.region,
        endpoint: row.azureEndpoint,
        apiKey: row.encryptedApiKey ? decryptSecret(row.encryptedApiKey) : null,
    };
}

export async function upsertAiConfig(
    teamId: string,
    input: {
        provider: AiProvider;
        models?: Partial<AiModelSettings>;
        region?: string;
        endpoint?: string;
        apiKey?: string;
        embedding?: {
            provider: EmbeddingProvider;
            apiKey?: string;
            deployment?: string;
            endpoint?: string;
        };
        indexContent?: { articles?: boolean; changelog?: boolean };
    },
): Promise<PublicAiConfig> {
    const existing = await db.query.aiSettings.findFirst({
        where: eq(aiSettings.teamId, teamId),
    });
    const encryptedApiKey = input.apiKey
        ? encryptSecret(input.apiKey)
        : undefined;
    const encryptedEmbeddingApiKey = input.embedding?.apiKey
        ? encryptSecret(input.embedding.apiKey)
        : undefined;

    if (existing) {
        const modelSettings = input.models
            ? { ...modelsFromRow(existing), ...input.models }
            : undefined;
        const [updated] = await db
            .update(aiSettings)
            .set({
                provider: input.provider,
                ...(modelSettings !== undefined ? { modelSettings } : {}),
                ...(input.region !== undefined
                    ? { region: input.region || null }
                    : {}),
                ...(input.endpoint !== undefined
                    ? { azureEndpoint: input.endpoint || null }
                    : {}),
                ...(encryptedApiKey !== undefined ? { encryptedApiKey } : {}),
                ...(input.embedding !== undefined
                    ? {
                          embeddingProvider: input.embedding.provider,
                          ...(input.embedding.deployment !== undefined
                              ? {
                                    embeddingDeployment:
                                        input.embedding.deployment || null,
                                }
                              : {}),
                          ...(input.embedding.endpoint !== undefined
                              ? {
                                    embeddingEndpoint:
                                        input.embedding.endpoint || null,
                                }
                              : {}),
                          ...(encryptedEmbeddingApiKey !== undefined
                              ? { encryptedEmbeddingApiKey }
                              : existing.embeddingProvider !==
                                  input.embedding.provider
                                ? { encryptedEmbeddingApiKey: null }
                                : {}),
                      }
                    : {}),
                ...(input.indexContent?.articles !== undefined
                    ? { indexArticles: input.indexContent.articles }
                    : {}),
                ...(input.indexContent?.changelog !== undefined
                    ? { indexChangelog: input.indexContent.changelog }
                    : {}),
                updatedAt: new Date(),
            })
            .where(eq(aiSettings.id, existing.id))
            .returning();
        if (existing.indexArticles && !updated.indexArticles) {
            await deleteChunksForTeamKind(teamId, "blog");
        }
        if (existing.indexChangelog && !updated.indexChangelog) {
            await deleteChunksForTeamKind(teamId, "changelog");
        }
        await enqueuePublishedDocsForTeam(teamId);
        return toPublic(updated);
    }

    const [created] = await db
        .insert(aiSettings)
        .values({
            teamId,
            provider: input.provider,
            model: null,
            modelSettings: input.models || {},
            region: input.region || null,
            azureEndpoint: input.endpoint || null,
            encryptedApiKey: encryptedApiKey ?? null,
            embeddingProvider: input.embedding?.provider ?? null,
            encryptedEmbeddingApiKey: encryptedEmbeddingApiKey ?? null,
            embeddingDeployment: input.embedding?.deployment || null,
            embeddingEndpoint: input.embedding?.endpoint || null,
            indexArticles: input.indexContent?.articles ?? false,
            indexChangelog: input.indexContent?.changelog ?? false,
        })
        .returning();
    await enqueuePublishedDocsForTeam(teamId);
    return toPublic(created);
}

export async function deleteAiConfig(teamId: string) {
    await deleteChunksForTeamKind(teamId, "blog");
    await deleteChunksForTeamKind(teamId, "changelog");
    await db.delete(aiSettings).where(eq(aiSettings.teamId, teamId));
    await enqueuePublishedDocsForTeam(teamId);
}
