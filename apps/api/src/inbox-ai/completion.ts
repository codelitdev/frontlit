import { generateObject } from "ai";
import { z } from "zod";
import type { SearchResult } from "../documentation/queries";
import { getLanguageModel } from "../ai/provider";
import type { ResolvedAiConfig } from "../ai/queries";
import { buildInstructions, wrapVisitorMessage } from "../chatbot/completion";
import {
    MAX_HISTORY_MESSAGES,
    MAX_MESSAGE_CHARS,
    MAX_OUTPUT_TOKENS,
} from "./config";

export const inboxAiModelResultSchema = z.object({
    answer: z.string().trim().min(1).max(4000),
    escalate: z.boolean(),
    reason: z.enum(["unsure"]).nullable(),
});

export type InboxAiModelResult = z.infer<typeof inboxAiModelResultSchema>;

export class InboxAiProviderError extends Error {
    constructor(
        public readonly kind:
            | "timeout"
            | "provider_auth"
            | "provider_transient"
            | "invalid_output",
        message: string,
    ) {
        super(message);
        this.name = "InboxAiProviderError";
    }
}

function clip(text: string): string {
    return text.length <= MAX_MESSAGE_CHARS
        ? text
        : text.slice(0, MAX_MESSAGE_CHARS);
}

function classifyProviderError(error: unknown): InboxAiProviderError {
    const message = error instanceof Error ? error.message : String(error);
    const lower = message.toLowerCase();
    if (lower.includes("timeout")) {
        return new InboxAiProviderError("timeout", message);
    }
    if (
        lower.includes("401") ||
        lower.includes("403") ||
        lower.includes("invalid api") ||
        lower.includes("unauthorized") ||
        lower.includes("authentication")
    ) {
        return new InboxAiProviderError("provider_auth", message);
    }
    return new InboxAiProviderError("provider_transient", message);
}

export async function generateStructuredInboxAnswer(input: {
    question: string;
    chunks: SearchResult[];
    history: { role: "user" | "assistant"; content: string }[];
    teamName?: string | null;
    aiConfig: ResolvedAiConfig;
    escalateWhenUnsure: boolean;
    timeoutMs: number;
}): Promise<{ result: InboxAiModelResult; usedTokens: number }> {
    const model = await getLanguageModel(input.aiConfig, "chatbot");
    if (!model) {
        throw new InboxAiProviderError(
            "provider_auth",
            "language_model_unavailable",
        );
    }

    const history = input.history.slice(-MAX_HISTORY_MESSAGES).map((turn) => ({
        role: turn.role,
        content: clip(turn.content),
    }));

    const unsureRule = input.escalateWhenUnsure
        ? 'If the articles do not contain enough detail to answer, set escalate=true and reason="unsure". Still provide a short answer that does not invent facts.'
        : "Do not set escalate=true. If you lack detail, say so briefly or ask a clarifying question. Never invent facts.";

    const instructions =
        buildInstructions(input.chunks, input.teamName) +
        `\n\nStructured response rules:\n- Return JSON with answer, escalate, and reason.\n- reason must be "unsure" when escalate is true, otherwise null.\n- ${unsureRule}`;

    const messages = [
        ...history.map((turn) =>
            turn.role === "user"
                ? {
                      role: "user" as const,
                      content: wrapVisitorMessage(clip(turn.content)),
                  }
                : { role: "assistant" as const, content: clip(turn.content) },
        ),
        {
            role: "user" as const,
            content: wrapVisitorMessage(clip(input.question)),
        },
    ];

    const work = generateObject({
        model,
        schema: inboxAiModelResultSchema,
        instructions,
        messages,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
    });

    const raced = await Promise.race([
        work,
        new Promise<never>((_, reject) =>
            setTimeout(
                () => reject(new InboxAiProviderError("timeout", "timeout")),
                input.timeoutMs,
            ),
        ),
    ]).catch((error) => {
        if (error instanceof InboxAiProviderError) throw error;
        throw classifyProviderError(error);
    });

    const parsed = inboxAiModelResultSchema.safeParse(raced.object);
    if (!parsed.success) {
        throw new InboxAiProviderError(
            "invalid_output",
            "invalid_structured_output",
        );
    }
    if (parsed.data.escalate && parsed.data.reason !== "unsure") {
        throw new InboxAiProviderError(
            "invalid_output",
            "escalate_requires_unsure",
        );
    }
    if (!parsed.data.escalate && parsed.data.reason !== null) {
        parsed.data.reason = null;
    }

    const usage = raced.usage;
    const usedTokens =
        (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0) ||
        estimateFromText(instructions, messages, parsed.data.answer);

    return { result: parsed.data, usedTokens };
}

function estimateFromText(
    instructions: string,
    messages: { content: string }[],
    answer: string,
): number {
    const input = [instructions, ...messages.map((m) => m.content)].join("\n");
    return Math.ceil(input.length / 4) + Math.ceil(answer.length / 4);
}
