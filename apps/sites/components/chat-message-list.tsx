"use client";

import type { RefObject } from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { Button, Caption } from "@frontlit/page-builder/primitives/server";
import { CitationList } from "@/components/citation-list";
import { PaperclipIcon } from "@/components/chat-icons";
import { useSiteThemeStyle } from "@/lib/site-theme-context";
import type { ChatMessage } from "@/lib/use-visitor-chat";

/** Answers stored on the server (as opposed to the greeting or a local
 * placeholder) have a public message id and can be rated. */
function canRate(message: ChatMessage) {
  return (
    message.author === "bot" &&
    !message.notice &&
    !message.error &&
    message.id.startsWith("tmsg_")
  );
}

function AnswerFeedback({
  message,
  onRate,
}: {
  message: ChatMessage;
  onRate: (messageId: string, rating: "up" | "down") => void;
}) {
  const theme = useSiteThemeStyle();
  const options = [
    { rating: "up" as const, label: "Helpful", Icon: ThumbsUp },
    { rating: "down" as const, label: "Not helpful", Icon: ThumbsDown },
  ];
  return (
    <div className="mt-1 flex items-center gap-1 px-1">
      {options.map(({ rating, label, Icon }) => {
        const selected = message.feedback === rating;
        return (
          <Button
            key={rating}
            theme={theme}
            type="button"
            variant="ghost"
            size="icon"
            className={`h-7 w-7 ${selected ? "text-foreground" : "text-muted-foreground"}`}
            aria-label={label}
            aria-pressed={selected}
            onClick={() => onRate(message.id, rating)}
          >
            <Icon className="h-3.5 w-3.5" fill={selected ? "currentColor" : "none"} />
          </Button>
        );
      })}
      {message.feedback && (
        <Caption theme={theme} role="status">
          Thanks for the feedback
        </Caption>
      )}
    </div>
  );
}

function TypingDots({ color }: { color: string }) {
  return (
    <div
      className="flex items-center gap-1 px-1 py-0.5"
      aria-label="Assistant is typing"
      role="status"
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="inline-block h-1.5 w-1.5 animate-bounce rounded-full"
          style={{
            backgroundColor: color,
            animationDelay: `${i * 120}ms`,
          }}
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
  onRate,
  className = "",
}: {
  messages: ChatMessage[];
  isSending: boolean;
  color: string;
  listRef: RefObject<HTMLDivElement | null>;
  bottomRef: RefObject<HTMLDivElement | null>;
  onListScroll: () => void;
  onRate?: (messageId: string, rating: "up" | "down") => void;
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
        <div
          key={message.id}
          className={
            message.role === "user" ? "flex justify-end" : "flex justify-start"
          }
        >
          <div
            className={`max-w-[85%] ${message.role === "user" ? "items-end" : "items-start"} flex flex-col`}
          >
            <p
              className={
                message.role === "user"
                  ? "whitespace-pre-wrap break-words rounded-2xl rounded-br-md px-3.5 py-2 text-sm leading-relaxed text-primary-foreground"
                  : message.error
                    ? "whitespace-pre-wrap break-words rounded-2xl rounded-bl-md border border-destructive/30 bg-destructive/10 px-3.5 py-2 text-sm leading-relaxed text-destructive"
                    : message.notice
                      ? "px-1 py-1 text-xs leading-relaxed text-muted-foreground"
                      : "whitespace-pre-wrap break-words rounded-2xl rounded-bl-md bg-muted px-3.5 py-2 text-sm leading-relaxed text-foreground"
              }
              style={message.role === "user" ? { backgroundColor: color } : undefined}
            >
              {message.content}
            </p>
            {message.attachments && message.attachments.length > 0 && (
              <div className="mt-2 flex w-full flex-col gap-2">
                {message.attachments.map((file) =>
                  file.mimeType.startsWith("image/") ? (
                    <a
                      key={file.attachmentId}
                      href={file.url}
                      target="_blank"
                      rel="noreferrer"
                      className="block overflow-hidden rounded-lg border"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={file.thumbnailUrl || file.url}
                        alt={file.fileName}
                        className="max-h-48 max-w-full object-contain"
                      />
                    </a>
                  ) : (
                    <a
                      key={file.attachmentId}
                      href={file.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex max-w-full items-center gap-1.5 truncate rounded-lg border bg-background px-2 py-1.5 text-xs underline-offset-2 hover:underline"
                    >
                      <PaperclipIcon className="h-3.5 w-3.5 shrink-0" />
                      {file.fileName}
                    </a>
                  ),
                )}
              </div>
            )}
            {message.author === "agent" && (
              <p className="mt-1 px-1 text-xs text-muted-foreground">Support agent</p>
            )}
            <CitationList sources={message.sources} />
            {onRate && canRate(message) && (
              <AnswerFeedback message={message} onRate={onRate} />
            )}
            {message.notice && (
              <p className="mt-1 px-1 text-xs text-muted-foreground">
                A teammate will continue this conversation.
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
