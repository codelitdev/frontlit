export const HANDOFF_COPY =
    "I'm handing this conversation to a teammate. They'll continue with you here.";

export const VISITOR_HANDOFF_PHRASES = [
    "talk to a person",
    "talk to a human",
    "speak to a person",
    "speak to a human",
    "human",
    "agent",
] as const;

export const MAX_HISTORY_MESSAGES = 20;
export const MAX_MESSAGE_CHARS = 4_000;
export const MAX_OUTPUT_TOKENS = 800;
export const CHAT_PROVIDER_TIMEOUT_MS = 20_000;
export const TICKET_PROVIDER_TIMEOUT_MS = 30_000;
export const TICKET_PROVIDER_RETRIES = 2;
export const GRANT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const DEFAULT_DAILY_TOKEN_BUDGET = 100_000;

export function inboxAiEnabled(): boolean {
    const raw = process.env.INBOX_AI_ENABLED;
    if (raw === undefined) return true;
    return raw !== "false" && raw !== "0";
}

export function dailyTokenBudget(): number {
    const raw = Number(process.env.INBOX_AI_DAILY_TOKEN_BUDGET);
    return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_DAILY_TOKEN_BUDGET;
}

export function estimateTokens(text: string): number {
    return Math.max(1, Math.ceil(text.length / 4));
}
