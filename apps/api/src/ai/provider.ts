import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";

/**
 * Server-side language models via Vercel AI SDK Core
 * (https://ai-sdk.dev/docs/getting-started/nodejs).
 *
 * Call sites never talk to provider HTTP APIs directly — they receive a
 * `LanguageModel` and pass it to `generateText` / `streamText` from `ai`.
 *
 * Providers (all AI SDK packages):
 * - OpenCode Go → `@ai-sdk/openai-compatible` against the Go gateway
 *   (https://opencode.ai/docs/go/#endpoints). This is the OpenAI-compatible
 *   path documented for Go API keys — not the OpenCode coding-agent CLI.
 * - OpenAI → `@ai-sdk/openai` (reads `OPENAI_API_KEY`)
 * - Anthropic → `@ai-sdk/anthropic` (reads `ANTHROPIC_API_KEY`)
 * - local → no model (extractive fallback in chatbot/completion.ts)
 */

export type ChatProviderName = "opencode-go" | "openai" | "anthropic" | "local";

const OPENCODE_GO_BASE_URL = process.env.OPENCODE_GO_BASE_URL || "https://opencode.ai/zen/go/v1";

const DEFAULT_MODELS: Record<Exclude<ChatProviderName, "local">, string> = {
    "opencode-go": "deepseek-v4-flash",
    openai: "gpt-4o-mini",
    anthropic: "claude-haiku-4-5-20251001",
};

/** Lazily built so env is read at first use (after dotenv / --env-file). */
let opencodeGoProvider: ReturnType<typeof createOpenAICompatible> | null = null;

function getOpencodeGoProvider() {
    if (opencodeGoProvider) return opencodeGoProvider;
    const apiKey = process.env.OPENCODE_API_KEY || process.env.OPENCODE_GO_API_KEY;
    if (!apiKey) {
        throw new Error(
            "OpenCode Go requires OPENCODE_API_KEY (from https://opencode.ai/auth). " +
                "Set it in apps/api/.env and restart the API.",
        );
    }
    opencodeGoProvider = createOpenAICompatible({
        name: "opencode-go",
        baseURL: OPENCODE_GO_BASE_URL,
        apiKey,
    });
    return opencodeGoProvider;
}

export function resolveChatProvider(): ChatProviderName {
    const configured = process.env.CHAT_PROVIDER?.trim().toLowerCase();
    if (configured === "opencode-go" || configured === "opencode" || configured === "go") {
        return "opencode-go";
    }
    if (configured === "openai" || configured === "anthropic" || configured === "local") {
        return configured;
    }

    if (process.env.OPENCODE_API_KEY || process.env.OPENCODE_GO_API_KEY) return "opencode-go";
    if (process.env.OPENAI_API_KEY) return "openai";
    if (process.env.ANTHROPIC_API_KEY) return "anthropic";
    return "local";
}

export function resolveChatModelId(provider: ChatProviderName = resolveChatProvider()): string {
    if (provider === "local") return "local";
    return process.env.CHAT_MODEL?.trim() || DEFAULT_MODELS[provider];
}

/**
 * AI SDK language model for the active chat provider, or `null` when the
 * extractive local fallback should run (no key / `CHAT_PROVIDER=local`).
 */
export function getChatLanguageModel(): LanguageModel | null {
    const provider = resolveChatProvider();
    if (provider === "local") return null;

    const modelId = resolveChatModelId(provider);

    switch (provider) {
        case "opencode-go":
            return getOpencodeGoProvider()(modelId);
        case "openai":
            // Default provider instance reads OPENAI_API_KEY from the environment.
            return openai(modelId);
        case "anthropic":
            return anthropic(modelId);
    }
}

/** One-line summary for boot logs. */
export function describeChatProvider(): string {
    const provider = resolveChatProvider();
    if (provider === "local") {
        return "chat=local (extractive fallback — set OPENCODE_API_KEY to use AI SDK + OpenCode Go)";
    }
    return `chat=${provider} model=${resolveChatModelId(provider)} (Vercel AI SDK)`;
}
