/**
 * The chat widget loader (docs/embedded-support.md §6.3, §6.8).
 *
 * One static file for every team, served as `embed.<domain>/chat.js` for
 * external sites and `/embed/chat.js` on FrontLit-hosted sites. Built with
 * `bun build` into `public/embed/chat.js`; no dependencies, no React.
 *
 *   window.FrontLit = window.FrontLit || { q: [], push(...a) { this.q.push(a); } };
 *   FrontLit.push("init", { teamId: "tm_abc123" });
 *
 * It draws the launcher, its unread badge and a preview of the latest
 * unread reply. The chat iframe is created on the first `open` (or, for an
 * ongoing chat, hidden once the page is idle) and hidden on close, so it can
 * keep receiving replies. Hosts with their own button can follow the unread
 * count: `FrontLit.push("onUnreadCountChange", (count) => ...)`.
 */

import type { WidgetConfig } from "./types";

interface InitOptions {
  teamId: string;
  launcher?: boolean;
  config?: WidgetConfig;
}

interface OpenOptions {
  token?: string;
}

type Command = [string, ...unknown[]];

const Z = "2147483000";
const ICONS: Record<string, string> = {
  chat: '<path d="M4 4h16v12H7l-3 3V4z"/>',
  message: '<path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>',
  sparkles: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
  bot: '<rect x="5" y="8" width="14" height="11" rx="3"/><path d="M12 5v3M9 12h.01M15 12h.01M9 16h6"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
};
const RADIUS: Record<string, string> = {
  none: "0",
  sm: "6px",
  md: "10px",
  lg: "16px",
  full: "9999px",
};

function svg(name: string): string {
  return `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] ?? ICONS.chat}</svg>`;
}

function css(el: HTMLElement, styles: Record<string, string>) {
  Object.assign(el.style, styles);
}

(() => {
  const w = window as unknown as {
    FrontLit?: { q?: Command[] } & Record<string, unknown>;
  };
  if (w.FrontLit && (w.FrontLit as { loaded?: boolean }).loaded) return;
  const queue: Command[] = w.FrontLit?.q ?? [];

  const script = document.currentScript as HTMLScriptElement | null;
  const scriptOrigin = script?.src ? new URL(script.src).origin : location.origin;

  let config: WidgetConfig | null = null;
  let started = false;
  let showLauncher = true;
  let launcher: HTMLButtonElement | null = null;
  let frame: HTMLIFrameElement | null = null;
  /** The panel is showing. Closing hides the iframe rather than removing it,
   * so the chat keeps watching for replies. */
  let isOpen = false;
  /** Unread replies, as the chat reports them (it reads them when in view). */
  let unread = 0;
  let preview: { text: string; author: string } | null = null;
  /** The preview the visitor dismissed, so it stays hidden. */
  let dismissed = "";
  let previewCard: HTMLDivElement | null = null;
  let baseTitle = "";
  const unreadHandlers: Array<(count: number) => void> = [];
  let chatOrigin = "";
  let token: string | undefined;
  /** `open` called before the settings arrived. */
  let pendingOpen: OpenOptions | null = null;
  let preconnected = false;

  /** Host-page key remembering an ongoing anonymous chat for this team. */
  let activeKey = "";
  const remembersChat = () => {
    try {
      return !!activeKey && localStorage.getItem(activeKey) === "1";
    } catch {
      return false;
    }
  };

  const docked = () => config?.variant === "text_input";
  const bubbleSize = () => {
    const size = config?.style?.bubbleSize;
    return size === "sm" ? 48 : size === "lg" ? 64 : 56;
  };

  function preconnect() {
    if (preconnected || !chatOrigin) return;
    preconnected = true;
    const link = document.createElement("link");
    link.rel = "preconnect";
    link.href = chatOrigin;
    document.head.appendChild(link);
  }

  /** Phones get a full-screen panel, like other chat widgets. */
  const phone = () => matchMedia("(max-width: 480px)").matches;

  /** Sizes the bubble panel for the current screen. */
  function placeFrame() {
    if (!frame || !config || docked()) return;
    if (phone()) {
      css(frame, {
        top: "0",
        right: "0",
        bottom: "0",
        width: "100%",
        height: "100%",
        border: "0",
        borderRadius: "0",
      });
      return;
    }
    const offset = showLauncher ? bubbleSize() + 24 : 16;
    css(frame, {
      top: "auto",
      right: "16px",
      bottom: `${offset}px`,
      width: "min(380px, calc(100vw - 32px))",
      height: `min(560px, calc(100vh - ${offset + 16}px))`,
      border: `1px solid ${config.colors?.border ?? "#e4e4e7"}`,
      borderRadius: "16px",
    });
  }

  function paintLauncher() {
    if (!launcher || !config) return;
    const open = isOpen;
    const name = config.name || "Chat";
    launcher.setAttribute("aria-expanded", String(open));
    if (docked()) {
      // A composer look-alike; the real composer lives in the iframe.
      launcher.style.display = open ? "none" : "flex";
      return;
    }
    // The full-screen panel has its own close button.
    launcher.style.display = open && phone() ? "none" : "flex";
    launcher.setAttribute("aria-label", open ? `Close ${name}` : `Open ${name}`);
    launcher.innerHTML = svg(open ? "close" : config.style?.bubbleIcon || "chat");
    if (unread && !open) {
      const badge = document.createElement("span");
      badge.textContent = unread > 9 ? "9+" : String(unread);
      css(badge, {
        position: "absolute",
        top: "-4px",
        right: "-4px",
        minWidth: "20px",
        height: "20px",
        padding: "0 5px",
        boxSizing: "border-box",
        borderRadius: "9999px",
        background: "#ef4444",
        color: "#fff",
        font: "600 12px/20px system-ui,sans-serif",
        textAlign: "center",
      });
      launcher.appendChild(badge);
      launcher.setAttribute(
        "aria-label",
        `Open ${name}, ${unread} unread ${unread === 1 ? "reply" : "replies"}`,
      );
    }
  }

  /** A card above the launcher with the latest unread reply, like other
   * chat widgets. Clicking it opens the chat. */
  function paintPreview() {
    const show =
      !!launcher &&
      !docked() &&
      !isOpen &&
      unread > 0 &&
      !!preview?.text &&
      preview.text !== dismissed;
    if (!show) {
      previewCard?.remove();
      previewCard = null;
      return;
    }
    if (!previewCard) {
      previewCard = document.createElement("div");
      previewCard.setAttribute("role", "status");
      css(previewCard, {
        position: "fixed",
        zIndex: Z,
        right: "16px",
        bottom: `${bubbleSize() + 28}px`,
        width: "min(300px, calc(100vw - 32px))",
        boxSizing: "border-box",
        padding: "12px 36px 12px 14px",
        borderRadius: "14px",
        background: config?.colors?.card ?? "#fff",
        color: "#18181b",
        boxShadow: "0 10px 30px rgba(0,0,0,.18)",
        font: "14px/1.4 system-ui,sans-serif",
        cursor: "pointer",
      });
      previewCard.addEventListener("click", () => open());
      document.body.appendChild(previewCard);
    }
    previewCard.textContent = "";
    const author = document.createElement("div");
    author.textContent = preview!.author;
    css(author, { fontWeight: "600", marginBottom: "2px" });
    const text = document.createElement("div");
    text.textContent = preview!.text;
    css(text, {
      display: "-webkit-box",
      webkitLineClamp: "3",
      webkitBoxOrient: "vertical",
      overflow: "hidden",
    });
    const dismiss = document.createElement("button");
    dismiss.type = "button";
    dismiss.setAttribute("aria-label", "Dismiss");
    dismiss.innerHTML = svg("close");
    css(dismiss, {
      position: "absolute",
      top: "8px",
      right: "8px",
      width: "20px",
      height: "20px",
      padding: "0",
      border: "0",
      background: "transparent",
      color: "inherit",
      opacity: ".6",
      cursor: "pointer",
    });
    dismiss.firstElementChild?.setAttribute("width", "16");
    dismiss.firstElementChild?.setAttribute("height", "16");
    dismiss.addEventListener("click", (event) => {
      event.stopPropagation();
      dismissed = preview?.text ?? "";
      paintPreview();
    });
    previewCard.append(author, text, dismiss);
  }

  function paintUnread() {
    paintLauncher();
    paintPreview();
    paintTitle();
  }

  /** Mirrors unread replies in the tab title while the tab is hidden. */
  function paintTitle() {
    if (unread && document.hidden) {
      if (!baseTitle) baseTitle = document.title;
      document.title = `(${unread}) ${baseTitle}`;
    } else if (baseTitle) {
      document.title = baseTitle;
      baseTitle = "";
    }
  }

  /** Lets the chat know whether the visitor can see it. */
  function tellPanel(open: boolean) {
    frame?.contentWindow?.postMessage({ type: "frontlit:panel", open }, chatOrigin);
  }

  function renderLauncher() {
    if (!config) return;
    const colors = config.colors;
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("data-frontlit-launcher", "");
    const base = {
      position: "fixed",
      zIndex: Z,
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      boxSizing: "border-box",
      boxShadow: "0 10px 25px rgba(0,0,0,.2)",
      font: "14px/1.4 system-ui,sans-serif",
    };
    if (docked()) {
      const width =
        config.style?.inputWidth === "sm"
          ? 220
          : config.style?.inputWidth === "lg"
            ? 340
            : 280;
      css(button, {
        ...base,
        bottom: "16px",
        left: "50%",
        transform: "translateX(-50%)",
        width: `${width}px`,
        maxWidth: "calc(100vw - 32px)",
        height: "48px",
        padding: "0 16px",
        borderRadius: RADIUS[config.style?.inputRadius || "full"] ?? "9999px",
        border: `1px solid ${colors?.border ?? "#e4e4e7"}`,
        background: colors?.card ?? "#fff",
        color: colors?.mutedForeground ?? "#52525b",
      });
      button.textContent = config.style?.inputPlaceholder || "Ask a question…";
      button.setAttribute("aria-label", config.name || "Chat");
    } else {
      const size = bubbleSize();
      const shape = config.style?.bubbleShape;
      css(button, {
        ...base,
        bottom: "16px",
        right: "16px",
        justifyContent: "center",
        width: `${size}px`,
        height: `${size}px`,
        padding: "0",
        border: "0",
        borderRadius:
          shape === "square" ? "8px" : shape === "rounded" ? "16px" : "9999px",
        background: colors?.primary ?? "#18181b",
        color: colors?.primaryForeground ?? "#fafafa",
      });
    }
    button.addEventListener("click", () => (isOpen ? close() : open()));
    button.addEventListener("pointerenter", preconnect);
    button.addEventListener("focus", preconnect);
    document.body.appendChild(button);
    launcher = button;
    paintLauncher();
  }

  function onMessage(event: MessageEvent) {
    if (!frame || event.source !== frame.contentWindow || event.origin !== chatOrigin)
      return;
    const data = event.data as { type?: string; height?: number } | null;
    if (data?.type === "frontlit:close") close();
    if (data?.type === "frontlit:conversation" && activeKey) {
      try {
        const active = (data as { active?: boolean }).active;
        if (active) localStorage.setItem(activeKey, "1");
        else localStorage.removeItem(activeKey);
      } catch {
        // Storage blocked: replies are noticed only after the chat is opened.
      }
    }
    if (data?.type === "frontlit:unread") {
      const next = data as { count?: number; preview?: typeof preview };
      const count = Math.max(0, Number(next.count) || 0);
      preview = next.preview ?? null;
      if (count !== unread) {
        unread = count;
        for (const handler of unreadHandlers) handler(count);
      }
      paintUnread();
    }
    if (data?.type === "chat-resize" && docked() && typeof data.height === "number") {
      const cap = Math.round(window.innerHeight * 0.7);
      frame.style.height = `${Math.max(72, Math.min(data.height, cap))}px`;
    }
  }

  /** Creates the chat iframe; `visible` false starts it hidden. */
  function open(options?: OpenOptions, visible = true) {
    if (options?.token) token = options.token;
    if (!config) {
      pendingOpen = options ?? {};
      return;
    }
    if (!config.enabled || !config.chatUrl) return;
    if (frame && options?.token && frame.dataset.token !== options.token) {
      // A new support session replaces the old chat.
      frame.remove();
      frame = null;
    }
    if (frame) {
      frame.style.display = "";
      isOpen = true;
      tellPanel(true);
      paintUnread();
      return;
    }
    const iframe = document.createElement("iframe");
    // The session token goes in the fragment so it never reaches server logs.
    iframe.src =
      config.chatUrl +
      (docked() ? "?layout=docked" : "?") +
      (visible ? "" : "&preload=1") +
      (token ? `#token=${encodeURIComponent(token)}` : "");
    iframe.title = config.name || "Chat";
    // autoplay lets the reply chime play once the visitor has used the page.
    iframe.allow = "clipboard-write; autoplay";
    if (docked()) {
      css(iframe, {
        position: "fixed",
        zIndex: Z,
        bottom: "0",
        left: "50%",
        transform: "translateX(-50%)",
        width: "380px",
        maxWidth: "calc(100vw - 16px)",
        height: "72px",
        border: "0",
        background: "transparent",
        colorScheme: "normal",
      });
    } else {
      css(iframe, {
        position: "fixed",
        zIndex: Z,
        boxShadow: "0 25px 50px -12px rgba(0,0,0,.25)",
        background: config.colors?.card ?? "#fff",
        colorScheme: "normal",
      });
    }
    if (token) iframe.dataset.token = token;
    if (!visible) iframe.style.display = "none";
    document.body.appendChild(iframe);
    frame = iframe;
    placeFrame();
    isOpen = visible;
    paintUnread();
  }

  function close() {
    pendingOpen = null;
    if (!frame || !isOpen) return;
    frame.style.display = "none";
    isOpen = false;
    tellPanel(false);
    paintUnread();
    launcher?.focus();
  }

  function start(next: WidgetConfig) {
    config = next;
    if (!config.enabled) return;
    if (config.chatUrl) chatOrigin = new URL(config.chatUrl).origin;
    window.addEventListener("message", onMessage);
    window.addEventListener("resize", () => {
      placeFrame();
      paintLauncher();
    });
    document.addEventListener("visibilitychange", paintTitle);
    if (showLauncher) renderLauncher();
    if (pendingOpen) {
      const options = pendingOpen;
      pendingOpen = null;
      open(options);
    } else if (remembersChat()) {
      // An ongoing chat: start it hidden once the page is idle so a reply
      // can mark the launcher and the tab.
      const preload = () => {
        if (!frame) open(undefined, false);
      };
      if ("requestIdleCallback" in window) requestIdleCallback(preload);
      else setTimeout(preload, 2000);
    }
  }

  function init(options: InitOptions) {
    if (started || !options?.teamId) return;
    started = true;
    showLauncher = options.launcher !== false;
    activeKey = `frontlit:chat:${options.teamId}`;
    if (options.config) {
      start(options.config);
      return;
    }
    fetch(`${scriptOrigin}/${encodeURIComponent(options.teamId)}/config`, {
      credentials: "omit",
    })
      .then((response) => (response.ok ? response.json() : { enabled: false }))
      .then(start, () => start({ enabled: false }));
  }

  /** Calls `handler` whenever the unread count changes (Intercom-style). */
  function onUnreadCountChange(handler: (count: number) => void) {
    if (typeof handler === "function") unreadHandlers.push(handler);
  }

  const commands: Record<string, (arg?: never) => void> = {
    init,
    open,
    close,
    onUnreadCountChange,
  };

  function push(name: string, arg?: unknown) {
    commands[name]?.(arg as never);
  }

  w.FrontLit = { loaded: true, q: [], push, init, open, close, onUnreadCountChange };
  for (const [name, arg] of queue) push(name, arg);
})();
