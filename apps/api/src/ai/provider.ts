import { createAnthropic } from "@ai-sdk/anthropic";
import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { createAzure } from "@ai-sdk/azure";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { createOpencode } from "ai-sdk-provider-opencode-sdk";
import type { LanguageModel } from "ai";
import { defaultAiModels, type AiModelPurpose } from "@frontlit/api-contract";
import type { ResolvedAiConfig } from "./queries";

/**
 * Server-side language models via Vercel AI SDK Core
 * (https://ai-sdk.dev/docs/getting-started/nodejs).
 *
 * Call sites never talk to provider HTTP APIs directly — they receive a
 * `LanguageModel` and pass it to `generateText` / `streamText` from `ai`.
 *
 * Providers (all AI SDK packages, configured per team):
 * - OpenRouter → `@openrouter/ai-sdk-provider`
 * - Amazon Bedrock → `@ai-sdk/amazon-bedrock`
 * - OpenCode → `ai-sdk-provider-opencode-sdk` backed by `@opencode-ai/sdk`
 * - OpenAI → `@ai-sdk/openai`
 * - Anthropic → `@ai-sdk/anthropic`
 * - no team configuration → inbox AI does not generate a reply
 */

export type ChatProviderName =
    "openai" | "azure" | "anthropic" | "openrouter" | "bedrock" | "opencode";

type TeamProviderConfig = Pick<
    ResolvedAiConfig,
    "provider" | "models" | "apiKey" | "region" | "endpoint"
>;

export function resolveChatModelId(
    provider: ChatProviderName,
    configuredModel?: string | null,
): string {
    return configuredModel?.trim() || defaultAiModels[provider].chatbot!;
}

export function resolveModelId(
    provider: ChatProviderName,
    purpose: AiModelPurpose,
    configuredModel?: string | null,
): string {
    return configuredModel?.trim() || defaultAiModels[provider][purpose]!;
}

/**
 * AI SDK language model for the team's configured provider, or `null` when
 * inbox AI should skip generation (no team credential).
 */
export function getChatLanguageModel(
    teamConfig?: TeamProviderConfig | null,
): Promise<LanguageModel | null> {
    return getLanguageModel(teamConfig, "chatbot");
}

/** Creates a model for a specific product purpose using the team's selected
 * model for that purpose. New AI features should call this rather than share
 * the chatbot selection. */
export function getLanguageModel(
    teamConfig: TeamProviderConfig | null | undefined,
    purpose: AiModelPurpose,
): Promise<LanguageModel | null> {
    if (teamConfig) {
        if (!teamConfig.apiKey) return Promise.resolve(null);
        const modelId = resolveModelId(
            teamConfig.provider,
            purpose,
            teamConfig.models[purpose],
        );
        switch (teamConfig.provider) {
            case "openai":
                return Promise.resolve(
                    createOpenAI({ apiKey: teamConfig.apiKey })(modelId),
                );
            case "azure":
                if (!teamConfig.endpoint) return Promise.resolve(null);
                return Promise.resolve(
                    createAzure({
                        apiKey: teamConfig.apiKey,
                        baseURL: teamConfig.endpoint,
                    })(modelId),
                );
            case "anthropic":
                return Promise.resolve(
                    createAnthropic({ apiKey: teamConfig.apiKey })(modelId),
                );
            case "openrouter":
                return Promise.resolve(
                    createOpenRouter({ apiKey: teamConfig.apiKey })(modelId),
                );
            case "bedrock":
                return Promise.resolve(
                    createAmazonBedrock({
                        apiKey: teamConfig.apiKey,
                        region: teamConfig.region || "us-east-1",
                    })(modelId as any),
                );
            case "opencode":
                return Promise.resolve(
                    createOpencode({
                        clientOptions: {
                            headers: {
                                Authorization: `Bearer ${teamConfig.apiKey}`,
                            },
                        },
                    })(modelId),
                );
        }
    }

    return Promise.resolve(null);
}

/** One-line summary for boot logs. */
export function describeChatProvider(): string {
    return "chat=team-configured (no generation when a team has no AI provider)";
}
