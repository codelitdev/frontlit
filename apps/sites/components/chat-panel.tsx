"use client";

import { useState } from "react";

interface ChatSource {
    documentId: string;
    slug: string;
    title: string | null;
    anchor: string | null;
}

interface ChatMessage {
    role: "user" | "assistant";
    content: string;
    sources?: ChatSource[];
    escalate?: boolean;
}

/**
 * The chat widget's actual UI, hosted at `/embed/chat` and iframed by both
 * the FrontLit-hosted floating widget and the external `<script>` loader
 * (architecture.md §7.3). Talks straight to the public, non-streaming chat
 * endpoint — history lives only in this component's state (no server-side
 * conversation persistence in v1, per architecture.md §7.2).
 */
export function ChatPanel({
    apiBaseUrl,
    teamId,
    name,
    greeting,
    accentColor,
}: {
    apiBaseUrl: string;
    teamId: string;
    name: string;
    greeting: string | null;
    accentColor: string | null;
}) {
    const [messages, setMessages] = useState<ChatMessage[]>(greeting ? [{ role: "assistant", content: greeting }] : []);
    const [input, setInput] = useState("");
    const [isSending, setIsSending] = useState(false);
    const color = accentColor || "#111827";

    const onSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const question = input.trim();
        if (!question || isSending) return;

        const history = messages.map((m) => ({ role: m.role, content: m.content }));
        setMessages((prev) => [...prev, { role: "user", content: question }]);
        setInput("");
        setIsSending(true);

        try {
            const res = await fetch(`${apiBaseUrl}/public/${teamId}/chat`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ message: question, history }),
            });
            if (!res.ok) throw new Error();
            const body = (await res.json()) as { answer: string; sources: ChatSource[]; escalate: boolean };
            setMessages((prev) => [...prev, { role: "assistant", content: body.answer, sources: body.sources, escalate: body.escalate }]);
        } catch {
            setMessages((prev) => [...prev, { role: "assistant", content: "Sorry, something went wrong. Please try again." }]);
        } finally {
            setIsSending(false);
        }
    };

    return (
        <div className="flex h-full flex-col">
            <header className="flex items-center gap-2 px-4 py-3 text-white" style={{ backgroundColor: color }}>
                <span className="font-medium">{name}</span>
            </header>

            <div className="flex-1 space-y-4 overflow-y-auto p-4">
                {messages.map((message, index) => (
                    <div key={index} className={message.role === "user" ? "text-right" : "text-left"}>
                        <p
                            className={
                                message.role === "user"
                                    ? "inline-block rounded-lg bg-neutral-900 px-3 py-2 text-sm text-white"
                                    : "inline-block rounded-lg bg-neutral-100 px-3 py-2 text-sm text-neutral-900"
                            }
                        >
                            {message.content}
                        </p>
                        {message.sources && message.sources.length > 0 && (
                            <ul className="mt-1 flex flex-col gap-0.5 text-xs text-neutral-500">
                                {message.sources.map((source) => (
                                    <li key={source.documentId}>
                                        <a href={`/docs/${source.slug}${source.anchor ? `#${source.anchor}` : ""}`} target="_blank" rel="noreferrer" className="underline">
                                            {source.title ?? source.slug}
                                        </a>
                                    </li>
                                ))}
                            </ul>
                        )}
                        {message.escalate && (
                            <p className="mt-1 text-xs">
                                <a href="/help" target="_blank" rel="noreferrer" className="underline">
                                    Talk to a human →
                                </a>
                            </p>
                        )}
                    </div>
                ))}
            </div>

            <form onSubmit={onSubmit} className="flex gap-2 border-t border-neutral-200 p-3">
                <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Ask a question…"
                    className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm"
                />
                <button
                    type="submit"
                    disabled={isSending || !input.trim()}
                    className="rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                    style={{ backgroundColor: color }}
                >
                    Send
                </button>
            </form>
        </div>
    );
}
