"use client";

import { useEffect, useMemo, useState } from "react";
import type { ChatbotWidgetStyle, ChatbotWidgetVariant } from "@/lib/api";
import { ChatPanel } from "@/components/chat-panel";
import {
  resolveChatAccent,
  resolveSiteTheme,
  siteThemeStyleTag,
} from "@/lib/site-theme";
import { SiteThemeProvider } from "@/lib/site-theme-context";

const DEFAULT_STYLE: ChatbotWidgetStyle = {
  bubbleShape: "circle",
  bubbleIcon: "chat",
  bubbleSize: "md",
  inputRadius: "full",
  inputPlaceholder: null,
  inputWidth: "md",
};

function bubbleSizePx(size: ChatbotWidgetStyle["bubbleSize"]) {
  return size === "sm" ? 48 : size === "lg" ? 64 : 56;
}

function bubbleRadius(shape: ChatbotWidgetStyle["bubbleShape"]) {
  return shape === "circle" ? "9999px" : shape === "rounded" ? "16px" : "8px";
}

function BubbleIcon({
  icon,
  className,
}: {
  icon: ChatbotWidgetStyle["bubbleIcon"];
  className?: string;
}) {
  const cn = className ?? "h-6 w-6";
  if (icon === "message") {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        className={cn}
      >
        <path
          d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (icon === "sparkles") {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" className={cn}>
        <path d="M12 2l1.5 5.5L19 9l-5.5 1.5L12 16l-1.5-5.5L5 9l5.5-1.5L12 2zm6 10l.9 3.1L22 16l-3.1.9L18 20l-.9-3.1L14 16l3.1-.9L18 12zM6 14l.7 2.3L9 17l-2.3.7L6 20l-.7-2.3L3 17l2.3-.7L6 14z" />
      </svg>
    );
  }
  if (icon === "bot") {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        className={cn}
      >
        <rect x="5" y="8" width="14" height="11" rx="3" />
        <path d="M12 5v3M9 12h.01M15 12h.01M9 16h6" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      className={cn}
    >
      <path d="M4 4h16v12H7l-3 3V4z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Floating chat launcher. Bubble variant opens an iframe panel; text-input
 * variant mounts the chat docked so the bottom field is the real composer
 * and messages float above it.
 */
export function ChatWidget({
  apiBaseUrl,
  teamId,
  name,
  greeting,
  accentColor,
  variant = "bubble",
  widgetStyle,
  themeId = null,
  themeStyle = null,
}: {
  apiBaseUrl: string;
  teamId: string;
  name: string;
  greeting: string | null;
  accentColor: string | null;
  variant?: ChatbotWidgetVariant;
  widgetStyle?: Partial<ChatbotWidgetStyle> | null;
  themeId?: string | null;
  themeStyle?: Record<string, unknown> | null;
}) {
  const [open, setOpen] = useState(false);
  const theme = useMemo(
    () => resolveSiteTheme(themeId, themeStyle),
    [themeId, themeStyle],
  );
  const themeCss = useMemo(
    () => siteThemeStyleTag(theme, "[data-chat-launcher]"),
    [theme],
  );
  const color = resolveChatAccent(accentColor, theme);
  const style: ChatbotWidgetStyle = {
    ...DEFAULT_STYLE,
    ...(widgetStyle ?? {}),
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const size = bubbleSizePx(style.bubbleSize);
  const isTextInput = variant === "text_input";

  // Text-input: real composer at bottom center; sheet opens above on focus/type.
  if (isTextInput) {
    return (
      <SiteThemeProvider theme={theme}>
        <div
          data-chat-launcher
          className="pb-theme fl-chat-launcher pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center px-4 pb-4"
        >
          {}
          <style dangerouslySetInnerHTML={{ __html: themeCss }} />
          <div className="pointer-events-auto w-full max-w-[min(380px,100%)]">
            <ChatPanel
              apiBaseUrl={apiBaseUrl}
              teamId={teamId}
              name={name}
              greeting={greeting}
              accentColor={accentColor}
              themeId={themeId}
              themeStyle={themeStyle}
              layout="docked"
              placeholder={style.inputPlaceholder || "Ask a question…"}
              inputRadius={style.inputRadius}
              inputWidth={style.inputWidth}
            />
          </div>
        </div>
      </SiteThemeProvider>
    );
  }

  return (
    <SiteThemeProvider theme={theme}>
      <div
        data-chat-launcher
        className="pb-theme fl-chat-launcher fixed bottom-4 right-4 z-50 flex flex-col items-end gap-3"
      >
        {}
        <style dangerouslySetInnerHTML={{ __html: themeCss }} />
        {open && (
          <div className="h-[min(560px,calc(100vh-6rem))] w-[min(380px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
            <iframe src="/embed/chat" title={name} className="h-full w-full border-0" />
          </div>
        )}

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? `Close ${name}` : `Open ${name}`}
          aria-expanded={open}
          className="flex items-center justify-center shadow-lg transition-transform hover:scale-105 active:scale-95"
          style={{
            width: size,
            height: size,
            borderRadius: bubbleRadius(style.bubbleShape),
            backgroundColor: color,
            color: theme.theme.colors.light.primaryForeground,
          }}
        >
          {open ? (
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              className="h-6 w-6"
            >
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          ) : (
            <BubbleIcon icon={style.bubbleIcon} />
          )}
        </button>
      </div>
    </SiteThemeProvider>
  );
}
