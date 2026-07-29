"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export interface ChatSource {
    documentId: string;
    slug: string;
    title: string | null;
    anchor: string | null;
}

export interface ChatMessage {
    id: string;
    role: "user" | "assistant";
    content: string;
    author?: "requester" | "agent" | "bot";
    sources?: ChatSource[];
    escalate?: boolean;
    /** Local-only error bubble (not from the server). */
    error?: boolean;
}

interface Conversation {
    id: string;
    token: string;
}

interface ThreadMessage {
    messageId: string;
    author: "requester" | "agent" | "bot";
    content: unknown;
}

function extractText(content: unknown): string {
    if (typeof content === "string") return content;
    if (!content || typeof content !== "object") return "";
    const value = content as Record<string, unknown>;
    const ownText = typeof value.text === "string" ? value.text : "";
    const childText = Array.isArray(value.content)
        ? value.content.map(extractText).join("")
        : "";
    return `${ownText}${childText}`;
}

function newId(prefix: string) {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Visitor chat conversation state for the public widget / embed panel.
 * Persists as a chatbot ticket so agents can reply from the shared inbox.
 */
export function useVisitorChat({
    apiBaseUrl,
    teamId,
    greeting,
}: {
    apiBaseUrl: string;
    teamId: string;
    greeting: string | null;
}) {
    const [messages, setMessages] = useState<ChatMessage[]>(() =>
        greeting
            ? [
                  {
                      id: "greeting",
                      role: "assistant",
                      content: greeting,
                      author: "bot",
                  },
              ]
            : [],
    );
    const [conversation, setConversation] = useState<Conversation | null>(null);
    const [input, setInput] = useState("");
    const [isSending, setIsSending] = useState(false);
    const [isHydrating, setIsHydrating] = useState(false);
    const storageKey = useMemo(
        () => `frontlit:chat:${apiBaseUrl}:${teamId}`,
        [apiBaseUrl, teamId],
    );

    const listRef = useRef<HTMLDivElement>(null);
    const bottomRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const isSendingRef = useRef(false);
    const stickToBottomRef = useRef(true);

    const scrollToBottom = useCallback(
        (behavior: ScrollBehavior = "smooth") => {
            bottomRef.current?.scrollIntoView({ behavior, block: "end" });
        },
        [],
    );

    useEffect(() => {
        isSendingRef.current = isSending;
        if (!isSending) {
            inputRef.current?.focus();
        }
    }, [isSending]);

    const onListScroll = () => {
        const el = listRef.current;
        if (!el) return;
        const distanceFromBottom =
            el.scrollHeight - el.scrollTop - el.clientHeight;
        stickToBottomRef.current = distanceFromBottom < 80;
    };

    const loadConversation = useCallback(
        async (current: Conversation) => {
            if (isSendingRef.current) return;

            const url = new URL(
                `${apiBaseUrl}/public/${teamId}/tickets/${current.id}/messages`,
            );
            url.searchParams.set("token", current.token);
            const response = await fetch(url, { cache: "no-store" });
            if (response.status === 401 || response.status === 404) {
                localStorage.removeItem(storageKey);
                setConversation(null);
                setMessages(
                    greeting
                        ? [
                              {
                                  id: "greeting",
                                  role: "assistant",
                                  content: greeting,
                                  author: "bot",
                              },
                          ]
                        : [],
                );
                return;
            }
            if (!response.ok) return;

            const thread = (await response.json()) as {
                messages: ThreadMessage[];
            };
            const next = thread.messages.map((message) => ({
                id: message.messageId,
                role: (message.author === "requester"
                    ? "user"
                    : "assistant") as "user" | "assistant",
                author: message.author,
                content: extractText(message.content),
            }));

            if (next.length === 0 && greeting) {
                setMessages([
                    {
                        id: "greeting",
                        role: "assistant",
                        content: greeting,
                        author: "bot",
                    },
                ]);
                return;
            }
            setMessages(next);
        },
        [apiBaseUrl, greeting, storageKey, teamId],
    );

    useEffect(() => {
        const stored = localStorage.getItem(storageKey);
        if (!stored) return;
        try {
            const parsed = JSON.parse(stored) as Conversation;
            if (parsed.id && parsed.token) {
                setIsHydrating(true);
                setConversation(parsed);
            }
        } catch {
            localStorage.removeItem(storageKey);
        }
    }, [storageKey]);

    useEffect(() => {
        if (!conversation) return;
        let cancelled = false;
        void (async () => {
            await loadConversation(conversation);
            if (!cancelled) setIsHydrating(false);
        })();
        const poll = window.setInterval(
            () => void loadConversation(conversation),
            5_000,
        );
        return () => {
            cancelled = true;
            window.clearInterval(poll);
        };
    }, [conversation, loadConversation]);

    const sendMessage = async () => {
        const question = input.trim();
        if (!question || isSending) return;

        const history = messages
            .filter((m) => !m.error)
            .map((m) => ({ role: m.role, content: m.content }));

        const userMessage: ChatMessage = {
            id: newId("local"),
            role: "user",
            content: question,
            author: "requester",
        };
        stickToBottomRef.current = true;
        setMessages((prev) => [...prev, userMessage]);
        setInput("");
        setIsSending(true);

        if (inputRef.current) {
            inputRef.current.style.height = "auto";
        }

        try {
            const res = await fetch(`${apiBaseUrl}/public/${teamId}/chat`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    message: question,
                    history,
                    ...(conversation
                        ? {
                              conversationId: conversation.id,
                              conversationToken: conversation.token,
                          }
                        : {}),
                }),
            });
            if (!res.ok) throw new Error(`Chat failed (${res.status})`);
            const body = (await res.json()) as {
                answer: string;
                sources: ChatSource[];
                escalate: boolean;
                conversationId: string;
                conversationToken: string;
            };
            const nextConversation = {
                id: body.conversationId,
                token: body.conversationToken,
            };
            localStorage.setItem(storageKey, JSON.stringify(nextConversation));
            setConversation(nextConversation);
            setMessages((prev) => [
                ...prev,
                {
                    id: newId("bot"),
                    role: "assistant",
                    author: "bot",
                    content: body.answer,
                    sources: body.sources,
                    escalate: body.escalate,
                },
            ]);
        } catch {
            setMessages((prev) => [
                ...prev,
                {
                    id: newId("err"),
                    role: "assistant",
                    content: "Sorry, something went wrong. Please try again.",
                    error: true,
                },
            ]);
        } finally {
            setIsSending(false);
        }
    };

    const onInputChange = (value: string) => {
        setInput(value);
        const el = inputRef.current;
        if (!el) return;
        el.style.height = "auto";
        el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
    };

    const canSend = Boolean(input.trim()) && !isSending;

    /** True once the visitor has more than a greeting (or is mid-reply). */
    const hasThread =
        isSending ||
        messages.some(
            (m) =>
                m.role === "user" ||
                m.error ||
                (m.role === "assistant" && m.id !== "greeting"),
        );

    return {
        messages,
        input,
        isSending,
        isHydrating,
        canSend,
        hasThread,
        conversation,
        listRef,
        bottomRef,
        inputRef,
        stickToBottomRef,
        scrollToBottom,
        onListScroll,
        sendMessage,
        setInput: onInputChange,
        rawSetInput: setInput,
    };
}
