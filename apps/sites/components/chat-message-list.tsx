"use client";

import type { RefObject } from "react";
import type { ChatMessage } from "@/lib/use-visitor-chat";

function TypingDots({ color }: { color: string }) {
    return (
        <div className="flex items-center gap-1 px-1 py-0.5" aria-label="Assistant is typing" role="status">
            {[0, 1, 2].map((i) => (
                <span
                    key={i}
                    className="inline-block h-1.5 w-1.5 animate-bounce rounded-full"
                    style={{ backgroundColor: color, animationDelay: `${i * 120}ms` }}
                />
            ))}
        </div>
    );
}

export function ChatMessageList({
    messages,
    isSending,
    color,
    listRef,
    bottomRef,
    onListScroll,
    className = "",
}: {
    messages: ChatMessage[];
    isSending: boolean;
    color: string;
    listRef: RefObject<HTMLDivElement | null>;
    bottomRef: RefObject<HTMLDivElement | null>;
    onListScroll: () => void;
    className?: string;
}) {
    return (
        <div
            ref={listRef}
            onScroll={onListScroll}
            className={className}
            role="log"
            aria-live="polite"
            aria-relevant="additions"
        >
            {messages.map((message) => (
                <div key={message.id} className={message.role === "user" ? "flex justify-end" : "flex justify-start"}>
                    <div className={`max-w-[85%] ${message.role === "user" ? "items-end" : "items-start"} flex flex-col`}>
                        <p
                            className={
                                message.role === "user"
                                    ? "whitespace-pre-wrap break-words rounded-2xl rounded-br-md px-3.5 py-2 text-sm leading-relaxed text-primary-foreground"
                                    : message.error
                                      ? "whitespace-pre-wrap break-words rounded-2xl rounded-bl-md border border-destructive/30 bg-destructive/10 px-3.5 py-2 text-sm leading-relaxed text-destructive"
                                      : "whitespace-pre-wrap break-words rounded-2xl rounded-bl-md bg-muted px-3.5 py-2 text-sm leading-relaxed text-foreground"
                            }
                            style={message.role === "user" ? { backgroundColor: color } : undefined}
                        >
                            {message.content}
                        </p>
                        {message.author === "agent" && <p className="mt-1 px-1 text-xs text-muted-foreground">Support agent</p>}
                        {message.sources && message.sources.length > 0 && (
                            <ul className="mt-1.5 flex flex-col gap-0.5 px-1 text-xs text-muted-foreground">
                                {message.sources.map((source) => (
                                    <li key={`${source.documentId}-${source.anchor ?? ""}`}>
                                        <a
                                            href={`/docs/${source.slug}${source.anchor ? `#${source.anchor}` : ""}`}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="underline underline-offset-2 hover:text-foreground"
                                        >
                                            {source.title ?? source.slug}
                                        </a>
                                    </li>
                                ))}
                            </ul>
                        )}
                        {message.escalate && (
                            <p className="mt-1.5 px-1 text-xs">
                                <a
                                    href="/help"
                                    target="_blank"
                                    rel="noreferrer"
                                    className="font-medium underline underline-offset-2"
                                    style={{ color }}
                                >
                                    Talk to a human →
                                </a>
                            </p>
                        )}
                    </div>
                </div>
            ))}

            {isSending && (
                <div className="flex justify-start">
                    <div className="rounded-2xl rounded-bl-md bg-muted px-3.5 py-2.5">
                        <TypingDots color={color} />
                    </div>
                </div>
            )}

            <div ref={bottomRef} className="h-px w-full shrink-0" aria-hidden />
        </div>
    );
}
