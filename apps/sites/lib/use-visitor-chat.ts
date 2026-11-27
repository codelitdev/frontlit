"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { playChime } from "./chime";
import { uploadChatFile, type ChatAttachment } from "./upload-chat-file";

export type { ChatAttachment };

export interface ChatSource {
  documentId: string;
  slug: string;
  title: string | null;
  anchor: string | null;
  kind?: "blog" | "doc" | "changelog" | "page" | "api-operation";
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  author?: "requester" | "agent" | "bot";
  sources?: ChatSource[];
  /** Visitor's rating of a persisted bot answer. */
  feedback?: "up" | "down" | null;
  escalate?: boolean;
  /** Local-only error bubble (not from the server). */
  error?: boolean;
  notice?: boolean;
  attachments?: ChatAttachment[];
}

interface Conversation {
  id: string;
  token: string;
}

interface ThreadMessage {
  messageId: string;
  author: "requester" | "agent" | "bot";
  content: unknown;
  attachments?: ChatAttachment[];
  sources?: ChatSource[];
  feedback?: "up" | "down" | null;
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

/** The in-app support session token the embed loader puts in this
 * iframe's URL fragment (docs/embedded-support.md §6.3), or null. */
function sessionTokenFromHash(): string | null {
  if (typeof window === "undefined") return null;
  const token = new URLSearchParams(window.location.hash.slice(1)).get("token");
  return token || null;
}

const SESSION_EXPIRED =
  "This support session has expired. Close the chat and open Help again.";

function newId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

/** A reply arrived: chime, and tell the loader on the host page so it can
 * mark the launcher and the tab when the chat isn't in view. */
function announceIncoming() {
  playChime();
  if (window.parent !== window) {
    window.parent.postMessage({ type: "frontlit:incoming" }, "*");
  }
}

function awaitingReplyNotice(): ChatMessage {
  return {
    id: newId("notice"),
    role: "assistant",
    author: "bot",
    notice: true,
    content: "Message sent — a teammate will reply here",
  };
}

/**
 * Visitor chat conversation state for the public widget / embed panel.
 * Persists as a chatbot ticket so agents can reply from the shared inbox.
 *
 * Two modes:
 * - Anonymous: the conversation is remembered in localStorage.
 * - In-app support session (`#token=` in the URL): identity comes from the
 *   host app's server; the conversation lives in memory only, so it can't
 *   leak to the next person on a shared computer (§6.3).
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
  const [pendingFiles, setPendingFiles] = useState<ChatAttachment[]>([]);
  const [attaching, setAttaching] = useState(false);
  const storageKey = useMemo(
    () => `chat:${apiBaseUrl}:${teamId}`,
    [apiBaseUrl, teamId],
  );
  const sessionToken = useMemo(() => sessionTokenFromHash(), []);
  const [sessionExpired, setSessionExpired] = useState(false);

  /** Remembers the conversation: localStorage for anonymous chats, memory
   * only for session chats. */
  const rememberConversation = useCallback(
    (next: Conversation | null) => {
      setConversation(next);
      if (sessionToken) return;
      if (next) localStorage.setItem(storageKey, JSON.stringify(next));
      else localStorage.removeItem(storageKey);
    },
    [sessionToken, storageKey],
  );

  const expireSession = useCallback(() => {
    setSessionExpired(true);
    setMessages((prev) => [
      ...prev.filter((message) => message.id !== "session-expired"),
      {
        id: "session-expired",
        role: "assistant",
        content: SESSION_EXPIRED,
        error: true,
      },
    ]);
  }, []);

  const listRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isSendingRef = useRef(false);
  const stickToBottomRef = useRef(true);
  /** Replies (bot or teammate) already shown for a conversation, so a
   * reload that brings a new one can chime. */
  const repliesSeenRef = useRef<{ id: string; count: number } | null>(null);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const el = listRef.current;
    if (!el) return;
    const top = el.scrollHeight;
    if (behavior === "smooth") {
      el.scrollTo({ top, behavior: "smooth" });
    } else {
      el.scrollTop = top;
    }
    requestAnimationFrame(() => {
      if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
    });
  }, []);

  useEffect(() => {
    isSendingRef.current = isSending;
    if (!isSending) {
      inputRef.current?.focus();
    }
  }, [isSending]);

  const onListScroll = () => {
    const el = listRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
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
        rememberConversation(null);
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
      const next: ChatMessage[] = thread.messages.map((message) => ({
        id: message.messageId,
        role: (message.author === "requester" ? "user" : "assistant") as
          | "user"
          | "assistant",
        author: message.author,
        content: extractText(message.content),
        attachments: message.attachments ?? [],
        sources: message.sources ?? [],
        feedback: message.feedback ?? null,
      }));

      const replies = next.filter((message) => message.role === "assistant").length;
      const seen = repliesSeenRef.current;
      if (seen?.id === current.id && replies > seen.count) announceIncoming();
      repliesSeenRef.current = { id: current.id, count: replies };

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
      // Nothing has answered the latest message yet (no AI, or it handed
      // off): keep saying so, or the reload would drop the "sent" notice.
      if (next.at(-1)?.role === "user") {
        next.push({ ...awaitingReplyNotice(), id: "awaiting-reply" });
      }
      setMessages(next);
    },
    [apiBaseUrl, greeting, rememberConversation, teamId],
  );

  // Session chat: resume the requester's open ticket, or start blank with
  // the host app's prefilled message. Nothing is created until they send.
  useEffect(() => {
    if (!sessionToken) return;
    let cancelled = false;
    void (async () => {
      const response = await fetch(
        `${apiBaseUrl}/public/${teamId}/support-sessions/open`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token: sessionToken }),
        },
      ).catch(() => null);
      if (cancelled || !response) return;
      if (response.status === 401) {
        expireSession();
        return;
      }
      if (!response.ok) return;
      const opened = (await response.json()) as {
        ticket: { ticketId: string; accessToken: string } | null;
        prefill: string | null;
      };
      if (cancelled) return;
      if (opened.ticket) {
        setIsHydrating(true);
        setConversation({
          id: opened.ticket.ticketId,
          token: opened.ticket.accessToken,
        });
      } else if (opened.prefill) {
        setInput((current) => current || opened.prefill!);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl, expireSession, sessionToken, teamId]);

  useEffect(() => {
    if (sessionToken) return;
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
  }, [sessionToken, storageKey]);

  // Tell the embed loader whether this visitor has an ongoing chat, so later
  // page loads can start the chat hidden and still notice replies. Session
  // chats live in memory only, so they never ask for that.
  useEffect(() => {
    if (sessionToken || window.parent === window) return;
    window.parent.postMessage(
      { type: "frontlit:conversation", active: Boolean(conversation) },
      "*",
    );
  }, [conversation, sessionToken]);

  useEffect(() => {
    if (!conversation) return;
    let cancelled = false;
    void (async () => {
      await loadConversation(conversation);
      if (!cancelled) setIsHydrating(false);
    })();
    // The iframe only exists while the panel is open; a hidden tab pauses
    // polling and catches up as soon as it is visible again.
    const poll = window.setInterval(() => {
      if (!document.hidden) void loadConversation(conversation);
    }, 2_000);
    const onVisible = () => {
      if (!document.hidden) void loadConversation(conversation);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [conversation, loadConversation]);

  const sendMessage = async () => {
    const question = input.trim();
    if ((!question && pendingFiles.length === 0) || isSending || attaching) return;
    if (sessionExpired) return;

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

    let latest = conversation;
    try {
      const res = await fetch(`${apiBaseUrl}/public/${teamId}/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: question,
          history,
          attachmentIds: pendingFiles.map((file) => file.attachmentId),
          ...(conversation
            ? {
                conversationId: conversation.id,
                conversationToken: conversation.token,
              }
            : sessionToken
              ? { sessionToken }
              : {}),
        }),
      });
      if (res.status === 401 && !conversation && sessionToken) {
        expireSession();
        return;
      }
      if (!res.ok) throw new Error(`Chat failed (${res.status})`);
      const body = (await res.json()) as {
        outcome?: "answered" | "human_only" | "escalated";
        answer: string | null;
        sources: ChatSource[];
        escalate: boolean;
        conversationId: string;
        conversationToken: string;
      };
      const nextConversation = {
        id: body.conversationId,
        token: body.conversationToken,
      };
      latest = nextConversation;
      if (repliesSeenRef.current?.id !== nextConversation.id) {
        // A new chat: its first reply should chime when the thread reloads.
        repliesSeenRef.current = { id: nextConversation.id, count: 0 };
      }
      rememberConversation(nextConversation);
      setPendingFiles([]);
      if (body.answer) {
        setMessages((prev) => [
          ...prev,
          {
            id: newId("bot"),
            role: "assistant",
            author: "bot",
            content: body.answer as string,
            sources: body.sources,
            escalate: body.outcome === "escalated" || body.escalate,
          },
        ]);
      } else {
        setMessages((prev) => [...prev, awaitingReplyNotice()]);
      }
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
      // Replace the optimistic bubbles with the persisted thread.
      if (latest) void loadConversation(latest).catch(() => undefined);
    }
  };

  /** Thumbs up/down on a persisted bot answer. Optimistic; reverts on failure. */
  const rateMessage = async (messageId: string, rating: "up" | "down") => {
    if (!conversation) return;
    const previous = messages.find((message) => message.id === messageId)?.feedback;
    const apply = (feedback: "up" | "down" | null | undefined) =>
      setMessages((prev) =>
        prev.map((message) =>
          message.id === messageId ? { ...message, feedback } : message,
        ),
      );
    apply(rating);
    try {
      const res = await fetch(`${apiBaseUrl}/public/${teamId}/chat/feedback`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          conversationId: conversation.id,
          conversationToken: conversation.token,
          messageId,
          rating,
        }),
      });
      if (!res.ok) throw new Error(`Feedback failed (${res.status})`);
    } catch {
      apply(previous);
    }
  };

  const onInputChange = (value: string) => {
    setInput(value);
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  };

  async function attachFiles(list: FileList | null) {
    if (!list?.length || attaching) return;
    setAttaching(true);
    try {
      let conversationId = conversation?.id;
      let conversationToken = conversation?.token;
      const added: ChatAttachment[] = [];
      for (const file of Array.from(list).slice(0, 5)) {
        const uploaded = await uploadChatFile({
          apiBaseUrl,
          teamId,
          file,
          conversationId,
          conversationToken,
          sessionToken,
        });
        conversationId = uploaded.conversationId;
        conversationToken = uploaded.conversationToken;
        added.push(uploaded.attachment);
      }
      if (conversationId && conversationToken) {
        rememberConversation({ id: conversationId, token: conversationToken });
      }
      setPendingFiles((current) => [...current, ...added].slice(0, 5));
    } finally {
      setAttaching(false);
    }
  }

  const canSend =
    (Boolean(input.trim()) || pendingFiles.length > 0) &&
    !isSending &&
    !attaching &&
    !sessionExpired;

  /** True once the visitor has more than a greeting (or is mid-reply). */
  const hasThread =
    isSending ||
    messages.some(
      (m) =>
        m.role === "user" || m.error || (m.role === "assistant" && m.id !== "greeting"),
    );

  return {
    messages,
    input,
    isSending,
    isHydrating,
    canSend,
    hasThread,
    conversation,
    pendingFiles,
    attaching,
    attachFiles,
    removePendingFile: (attachmentId: string) =>
      setPendingFiles((current) =>
        current.filter((file) => file.attachmentId !== attachmentId),
      ),
    listRef,
    bottomRef,
    inputRef,
    stickToBottomRef,
    scrollToBottom,
    onListScroll,
    sendMessage,
    rateMessage,
    setInput: onInputChange,
    rawSetInput: setInput,
  };
}
