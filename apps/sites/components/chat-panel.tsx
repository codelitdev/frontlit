"use client";

import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { ChatMessageList } from "@/components/chat-message-list";
import { PaperclipIcon, SpinnerIcon } from "@/components/chat-icons";
import { useVisitorChat } from "@/lib/use-visitor-chat";
import { isChimeMuted, setChimeMuted } from "@/lib/chime";
import {
  resolveChatAccent,
  resolveSiteTheme,
  siteThemeStyleTag,
} from "@/lib/site-theme";
import { SiteThemeProvider, useSiteThemeStyle } from "@/lib/site-theme-context";
import { Button } from "@frontlit/page-builder/primitives/server";

/** Asks the embed loader (apps/sites/embed/chat.ts) to close the panel. It
 * hides the iframe, which keeps polling so a reply can mark the launcher. */
function requestClose() {
  window.parent?.postMessage({ type: "frontlit:close" }, "*");
}

function CloseIcon({ path }: { path: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      className="h-4 w-4"
    >
      <path d={path} strokeLinecap="round" />
    </svg>
  );
}

/** Hands the conversation to the team without going through the AI
 * (docs/embedded-support.md §6.6). Shown once there is a conversation. */
function TalkToHumanButton({ busy, onClick }: { busy: boolean; onClick: () => void }) {
  const theme = useSiteThemeStyle();
  return (
    <Button
      theme={theme}
      type="button"
      variant="ghost"
      size="sm"
      disabled={busy}
      onClick={onClick}
      className="h-7 shrink-0 rounded-full border border-current/30 px-2.5 text-xs font-medium text-inherit hover:bg-black/10 hover:text-inherit"
    >
      {busy ? "Connecting…" : "Talk to a human"}
    </Button>
  );
}

/** Turns the new-reply chime on or off (remembered in this browser). */
function SoundToggle() {
  const [muted, setMuted] = useState(false);
  useEffect(() => setMuted(isChimeMuted()), []);
  return (
    <button
      type="button"
      aria-label={muted ? "Turn on reply sound" : "Turn off reply sound"}
      aria-pressed={!muted}
      title={muted ? "Reply sound off" : "Reply sound on"}
      className="rounded-md p-1 opacity-90 hover:bg-black/10"
      onClick={() => {
        setChimeMuted(!muted);
        setMuted(!muted);
      }}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4 w-4"
        aria-hidden
      >
        <path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z" />
        {muted ? (
          <path d="M22 9l-6 6M16 9l6 6" />
        ) : (
          <path d="M16 9a5 5 0 0 1 0 6M19.364 18.364a9 9 0 0 0 0-12.728" />
        )}
      </svg>
    </button>
  );
}

function AttachControl({
  attaching,
  disabled,
  accent,
  border,
  muted,
  mutedForeground,
  card,
  onFiles,
  className,
}: {
  attaching: boolean;
  disabled: boolean;
  accent: string;
  border: string;
  muted: string;
  mutedForeground: string;
  card: string;
  onFiles: (files: FileList | null) => void;
  className: string;
}) {
  return (
    <label
      className={`flex shrink-0 cursor-pointer items-center justify-center border ${className} ${disabled ? "pointer-events-none opacity-50" : ""}`}
      style={{
        borderColor: border,
        color: attaching ? accent : mutedForeground,
        backgroundColor: card,
      }}
      onMouseEnter={(event) => {
        if (disabled) return;
        event.currentTarget.style.backgroundColor = muted;
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.backgroundColor = card;
      }}
    >
      <input
        type="file"
        multiple
        className="hidden"
        disabled={disabled}
        onChange={(event) => {
          onFiles(event.target.files);
          event.target.value = "";
        }}
      />
      {attaching ? (
        <SpinnerIcon className="h-4 w-4 animate-spin" color={accent} />
      ) : (
        <PaperclipIcon className="h-4 w-4" />
      )}
      <span className="sr-only">{attaching ? "Uploading file" : "Attach a file"}</span>
    </label>
  );
}

function PendingFileChips({
  files,
  onRemove,
  border,
  muted,
  foreground,
  mutedForeground,
}: {
  files: { attachmentId: string; fileName: string }[];
  onRemove: (attachmentId: string) => void;
  border: string;
  muted: string;
  foreground: string;
  mutedForeground: string;
}) {
  if (files.length === 0) return null;
  return (
    <div className="mb-2 flex flex-wrap gap-1.5">
      {files.map((file) => (
        <button
          key={file.attachmentId}
          type="button"
          className="inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]"
          style={{
            borderColor: border,
            backgroundColor: muted,
            color: foreground,
          }}
          onClick={() => onRemove(file.attachmentId)}
        >
          <PaperclipIcon className="h-3 w-3 shrink-0" />
          <span className="truncate" style={{ color: mutedForeground }}>
            {file.fileName} ×
          </span>
        </button>
      ))}
    </div>
  );
}

/**
 * The chat widget's actual UI, served at `embed.<domain>/<teamId>/chat` and
 * iframed by the embed loader (apps/sites/embed/chat.ts) on hosted and
 * external sites alike (docs/embedded-support.md §6.3).
 *
 * - `layout="panel"` — classic full chat chrome (header + messages + composer).
 * - `layout="docked"` — bottom text field is the composer; a floating message
 *   sheet opens above it when the visitor focuses/types (text-input variant).
 */
export function ChatPanel({
  apiBaseUrl,
  teamId,
  name,
  greeting,
  accentColor,
  themeId = null,
  themeStyle = null,
  layout = "panel",
  placeholder = "Ask a question…",
  inputRadius = "full",
  inputWidth = "md",
}: {
  apiBaseUrl: string;
  teamId: string;
  name: string;
  greeting: string | null;
  accentColor: string | null;
  themeId?: string | null;
  themeStyle?: Record<string, unknown> | null;
  layout?: "panel" | "docked";
  placeholder?: string;
  inputRadius?: "none" | "sm" | "md" | "lg" | "full";
  inputWidth?: "sm" | "md" | "lg";
}) {
  const theme = useMemo(
    () => resolveSiteTheme(themeId, themeStyle),
    [themeId, themeStyle],
  );
  const themeCss = useMemo(
    () => siteThemeStyleTag(theme, "[data-chat-panel]"),
    [theme],
  );
  const color = resolveChatAccent(accentColor, theme);
  const palette = theme.theme.colors.light;

  const chat = useVisitorChat({ apiBaseUrl, teamId, greeting });
  const {
    messages,
    input,
    isSending,
    isHydrating,
    canSend,
    hasThread,
    listRef,
    bottomRef,
    inputRef,
    stickToBottomRef,
    scrollToBottom,
    onListScroll,
    sendMessage,
    setInput,
    pendingFiles,
    attaching,
    attachFiles,
    removePendingFile,
  } = chat;

  const [focused, setFocused] = useState(false);
  /** Docked sheet stays open after first engagement until Escape / blur-away. */
  const [sheetPinned, setSheetPinned] = useState(false);

  useLayoutEffect(() => {
    if (!stickToBottomRef.current) return;
    scrollToBottom(messages.length <= 2 ? "auto" : "smooth");
  }, [messages, isSending, scrollToBottom, stickToBottomRef]);

  // The iframe is created when the visitor opens the chat, so the composer
  // takes focus straight away in both layouts.
  useEffect(() => {
    inputRef.current?.focus();
  }, [inputRef]);

  useEffect(() => {
    if (hasThread) setSheetPinned(true);
  }, [hasThread]);

  const showSheet =
    layout === "docked" &&
    (focused || sheetPinned || isSending || input.trim().length > 0);

  // Tell the embed loader to grow/shrink the docked iframe. This frame is
  // only as tall as the iframe, so the loader caps the height against the
  // host page's viewport.
  useEffect(() => {
    if (layout !== "docked") return;
    const height = showSheet ? 560 : 72;
    window.parent?.postMessage({ type: "chat-resize", height }, "*");
  }, [layout, showSheet]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSheetPinned(true);
    void sendMessage();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      setSheetPinned(true);
      void sendMessage();
    }
  };

  const radiusPx =
    inputRadius === "none"
      ? "0px"
      : inputRadius === "sm"
        ? "6px"
        : inputRadius === "md"
          ? "10px"
          : inputRadius === "lg"
            ? "16px"
            : "9999px";
  const widthPx = inputWidth === "sm" ? 220 : inputWidth === "lg" ? 340 : 280;

  if (layout === "docked") {
    return (
      <SiteThemeProvider theme={theme}>
        <div
          data-chat-panel
          className="pb-theme fl-chat flex h-full max-h-[min(560px,100vh)] min-h-0 w-full flex-col items-center justify-end gap-3 bg-transparent p-0 text-foreground [&>form]:mx-auto"
        >
          {}
          <style dangerouslySetInnerHTML={{ __html: themeCss }} />

          {showSheet && (
            <div
              className="flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-2xl border shadow-2xl"
              style={{
                borderColor: palette.border,
                backgroundColor: palette.card,
                minHeight: "12rem",
                maxHeight: "min(480px, calc(100vh - 5rem))",
                height: "min(420px, calc(100vh - 5rem))",
              }}
            >
              <header
                className="flex shrink-0 items-center justify-between gap-2 px-4 py-2.5 text-primary-foreground"
                style={{ backgroundColor: color }}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium leading-tight">{name}</p>
                  <p className="truncate text-[11px] opacity-80">
                    {isSending ? "Typing…" : isHydrating ? "Loading…" : "Online"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {chat.canTalkToHuman && (
                    <TalkToHumanButton
                      busy={chat.escalating}
                      onClick={() => void chat.talkToHuman()}
                    />
                  )}
                  <SoundToggle />
                  <button
                    type="button"
                    aria-label="Close chat"
                    className="rounded-md p-1 opacity-90 hover:bg-black/10"
                    onClick={requestClose}
                  >
                    <CloseIcon path="M6 12h12" />
                  </button>
                </div>
              </header>
              <ChatMessageList
                messages={messages}
                isSending={isSending}
                color={color}
                listRef={listRef}
                bottomRef={bottomRef}
                onListScroll={onListScroll}
                onRate={chat.rateMessage}
                className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-3"
              />
            </div>
          )}

          <form
            onSubmit={onSubmit}
            className="w-full shrink-0"
            style={{ maxWidth: widthPx, width: "100%" }}
          >
            <PendingFileChips
              files={pendingFiles}
              onRemove={removePendingFile}
              border={palette.border}
              muted={palette.muted}
              foreground={palette.foreground}
              mutedForeground={palette.mutedForeground}
            />
            <div
              className="flex items-end gap-2 border px-3 py-2 shadow-lg"
              style={{
                borderRadius: radiusPx,
                borderColor: palette.border,
                backgroundColor: palette.card,
              }}
            >
              <AttachControl
                attaching={attaching}
                disabled={isSending || attaching}
                accent={color}
                border={palette.border}
                muted={palette.muted}
                mutedForeground={palette.mutedForeground}
                card={palette.card}
                onFiles={(files) => void attachFiles(files)}
                className="mb-0.5 h-8 w-8 rounded-full"
              />
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                onFocus={() => {
                  setFocused(true);
                  setSheetPinned(true);
                }}
                onBlur={() => setFocused(false)}
                placeholder={placeholder}
                rows={1}
                disabled={isSending}
                enterKeyHint="send"
                aria-label="Message"
                className="max-h-[120px] min-h-[32px] flex-1 resize-none bg-transparent py-1.5 text-sm leading-5 text-foreground outline-none placeholder:text-muted-foreground disabled:opacity-60"
                style={{ color: palette.foreground }}
              />
              <button
                type="submit"
                disabled={!canSend}
                aria-label="Send message"
                className="mb-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-primary-foreground shadow-sm transition enabled:hover:scale-105 enabled:active:scale-95 disabled:opacity-40"
                style={{
                  backgroundColor: color,
                  color: palette.primaryForeground,
                }}
              >
                {isSending ? (
                  <SpinnerIcon
                    className="h-3.5 w-3.5 animate-spin"
                    color={palette.primaryForeground}
                  />
                ) : (
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2.25}
                    className="h-4 w-4"
                    aria-hidden
                  >
                    <path
                      d="M12 19V5M5 12l7-7 7 7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </button>
            </div>
          </form>
        </div>
      </SiteThemeProvider>
    );
  }

  return (
    <SiteThemeProvider theme={theme}>
      <div
        data-chat-panel
        className="pb-theme fl-chat flex h-full min-h-0 flex-col bg-background text-foreground"
      >
        {}
        <style dangerouslySetInnerHTML={{ __html: themeCss }} />
        <header
          className="flex shrink-0 items-center justify-between gap-2 px-4 py-3 text-primary-foreground"
          style={{ backgroundColor: color }}
        >
          <div className="min-w-0">
            <p className="truncate font-medium leading-tight">{name}</p>
            <p className="truncate text-xs opacity-80">
              {isSending ? "Typing…" : isHydrating ? "Loading conversation…" : "Online"}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {chat.canTalkToHuman && (
              <TalkToHumanButton
                busy={chat.escalating}
                onClick={() => void chat.talkToHuman()}
              />
            )}
            <SoundToggle />
            <button
              type="button"
              aria-label="Close chat"
              className="rounded-md p-1 opacity-90 hover:bg-black/10"
              onClick={requestClose}
            >
              <CloseIcon path="M6 6l12 12M18 6L6 18" />
            </button>
          </div>
        </header>

        <ChatMessageList
          messages={messages}
          isSending={isSending}
          color={color}
          listRef={listRef}
          bottomRef={bottomRef}
          onListScroll={onListScroll}
          onRate={chat.rateMessage}
          className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain bg-background px-4 py-4"
        />

        <form
          onSubmit={onSubmit}
          className="shrink-0 border-t border-border bg-card p-3"
        >
          <PendingFileChips
            files={pendingFiles}
            onRemove={removePendingFile}
            border={palette.border}
            muted={palette.muted}
            foreground={palette.foreground}
            mutedForeground={palette.mutedForeground}
          />
          <div className="flex items-end gap-2">
            <AttachControl
              attaching={attaching}
              disabled={isSending || attaching}
              accent={color}
              border={palette.border}
              muted={palette.muted}
              mutedForeground={palette.mutedForeground}
              card={palette.card}
              onFiles={(files) => void attachFiles(files)}
              className="h-10 w-10 rounded-xl"
            />
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={placeholder}
              rows={1}
              disabled={isSending}
              enterKeyHint="send"
              aria-label="Message"
              className="max-h-[120px] min-h-[40px] flex-1 resize-none rounded-xl border border-input bg-background px-3 py-2.5 text-sm leading-5 text-foreground outline-none transition placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/30 disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={!canSend}
              aria-label="Send message"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-primary-foreground shadow-sm transition enabled:hover:scale-105 enabled:active:scale-95 disabled:opacity-40"
              style={{ backgroundColor: color }}
            >
              {isSending ? (
                <SpinnerIcon
                  className="h-4 w-4 animate-spin"
                  color={palette.primaryForeground}
                />
              ) : (
                <svg
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="h-4 w-4 translate-x-px"
                  aria-hidden
                >
                  <path d="M3.4 20.6 21 12 3.4 3.4 3 10l12 2-12 2z" />
                </svg>
              )}
            </button>
          </div>
          <p className="mt-1.5 px-0.5 text-[11px] text-muted-foreground">
            <kbd className="rounded border border-border bg-muted px-1">Enter</kbd> to
            send ·{" "}
            <kbd className="rounded border border-border bg-muted px-1">Shift</kbd>+
            <kbd className="rounded border border-border bg-muted px-1">Enter</kbd> for
            new line
          </p>
        </form>
      </div>
    </SiteThemeProvider>
  );
}
