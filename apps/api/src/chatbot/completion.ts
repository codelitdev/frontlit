import type { SearchResult } from "../documentation/queries";

export interface ChatSource {
    documentId: string;
    slug: string;
    title: string | null;
    anchor: string | null;
}

export interface ChatAnswer {
    answer: string;
    sources: ChatSource[];
    /** No grounding sources found — the widget offers "talk to a human"
     * if the team has escalation enabled (architecture.md §11.2). */
    escalate: boolean;
}

function toSources(chunks: SearchResult[]): ChatSource[] {
    const seen = new Set<string>();
    const sources: ChatSource[] = [];
    for (const chunk of chunks) {
        const key = `${chunk.documentId}#${chunk.anchor ?? ""}`;
        if (seen.has(key)) continue;
        seen.add(key);
        sources.push({ documentId: chunk.documentId, slug: chunk.slug, title: chunk.title, anchor: chunk.anchor });
    }
    return sources;
}

const SYSTEM_PROMPT =
    "You are a helpful support assistant. Answer only using the provided help articles. " +
    "If the articles don't contain the answer, say you don't know and suggest contacting support. " +
    "Cite the articles you used by name.";

function provider(): "openai" | "local" {
    const configured = process.env.CHAT_PROVIDER;
    if (configured === "openai" || configured === "local") return configured;
    return process.env.OPENAI_API_KEY ? "openai" : "local";
}

/**
 * Generates a chat answer grounded in the retrieved doc chunks
 * (architecture.md §7.2). Two implementations, selected the same way as
 * the embeddings provider (`documentation/embeddings.ts`):
 *
 * - `openai`: a real Chat Completions call (plain `fetch`).
 * - `local`: an extractive fallback with no LLM at all \u2014 returns the
 *   top-matching chunk verbatim with its citation. Honest about not being
 *   generative, but keeps the whole retrieval \u2192 answer \u2192 citation flow
 *   genuinely exercisable without an API key.
 */
export async function getChatAnswer(question: string, chunks: SearchResult[], history: { role: "user" | "assistant"; content: string }[] = []): Promise<ChatAnswer> {
    if (chunks.length === 0) {
        return {
            answer: "I don't know \u2014 I couldn't find anything relevant in the help docs. Please contact support.",
            sources: [],
            escalate: true,
        };
    }

    const result = provider() === "openai" ? await getOpenAiAnswer(question, chunks, history) : getLocalAnswer(chunks);
    return { ...result, escalate: false };
}

function getLocalAnswer(chunks: SearchResult[]): Omit<ChatAnswer, "escalate"> {
    const top = chunks[0];
    const citation = top.title ? ` (from "${top.title}")` : "";
    return { answer: `${top.content}${citation}`, sources: toSources(chunks) };
}

async function getOpenAiAnswer(
    question: string,
    chunks: SearchResult[],
    history: { role: "user" | "assistant"; content: string }[],
): Promise<Omit<ChatAnswer, "escalate">> {
    const apiKey = process.env.OPENAI_API_KEY;
    const model = process.env.CHAT_MODEL || "gpt-4o-mini";

    const context = chunks
        .map((chunk, i) => `[${i + 1}] ${chunk.title ?? "Untitled"}${chunk.heading ? ` \u2014 ${chunk.heading}` : ""}\n${chunk.content}`)
        .join("\n\n");

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
            model,
            messages: [
                { role: "system", content: `${SYSTEM_PROMPT}\n\nHelp articles:\n${context}` },
                ...history,
                { role: "user", content: question },
            ],
        }),
    });

    if (!res.ok) {
        const body = await res.text();
        throw new Error(`OpenAI chat completion failed (${res.status}): ${body}`);
    }

    const json = (await res.json()) as { choices: { message: { content: string } }[] };
    return { answer: json.choices[0]?.message.content ?? "", sources: toSources(chunks) };
}
