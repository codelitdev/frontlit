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
 * It draws only the launcher. The chat iframe is created on the first
 * `open` and removed on close, so nothing polls while the panel is closed.
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
  /** Replies that arrived while the panel was closed or the tab hidden. */
  let unread = 0;
  let baseTitle = "";
  let dot: HTMLSpanElement | null = null;
  let chatOrigin = "";
  let token: string | undefined;
  /** `open` called before the settings arrived. */
  let pendingOpen: OpenOptions | null = null;
  let preconnected = false;

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
    launcher.setAttribute("aria-label", open ? `Close ${name}` : `Open ${name}`);
    launcher.innerHTML = svg(open ? "close" : config.style?.bubbleIcon || "chat");
    if (unread && !open) {
      dot ??= document.createElement("span");
      css(dot, {
        position: "absolute",
        top: "2px",
        right: "2px",
        width: "12px",
        height: "12px",
        borderRadius: "9999px",
        background: "#ef4444",
        border: "2px solid #fff",
      });
      launcher.appendChild(dot);
      launcher.setAttribute("aria-label", `Open ${name}, new reply`);
    }
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

  function markRead() {
    if (!isOpen || document.hidden) return;
    unread = 0;
    paintTitle();
    paintLauncher();
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
    if (data?.type === "frontlit:incoming" && (!isOpen || document.hidden)) {
      unread += 1;
      paintTitle();
      paintLauncher();
    }
    if (data?.type === "chat-resize" && docked() && typeof data.height === "number") {
      const cap = Math.round(window.innerHeight * 0.7);
      frame.style.height = `${Math.max(72, Math.min(data.height, cap))}px`;
    }
  }

  function open(options?: OpenOptions) {
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
      markRead();
      paintLauncher();
      return;
    }
    const iframe = document.createElement("iframe");
    // The session token goes in the fragment so it never reaches server logs.
    iframe.src =
      config.chatUrl +
      (docked() ? "?layout=docked" : "") +
      (token ? `#token=${encodeURIComponent(token)}` : "");
    iframe.title = config.name || "Chat";
    iframe.allow = "clipboard-write";
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
      const offset = showLauncher ? bubbleSize() + 24 : 16;
      css(iframe, {
        position: "fixed",
        zIndex: Z,
        right: "16px",
        bottom: `${offset}px`,
        width: "min(380px, calc(100vw - 32px))",
        height: `min(560px, calc(100vh - ${offset + 16}px))`,
        border: `1px solid ${config.colors?.border ?? "#e4e4e7"}`,
        borderRadius: "16px",
        boxShadow: "0 25px 50px -12px rgba(0,0,0,.25)",
        background: config.colors?.card ?? "#fff",
        colorScheme: "normal",
      });
    }
    if (token) iframe.dataset.token = token;
    document.body.appendChild(iframe);
    frame = iframe;
    isOpen = true;
    markRead();
  }

  function close() {
    pendingOpen = null;
    if (!frame || !isOpen) return;
    frame.style.display = "none";
    isOpen = false;
    paintLauncher();
    launcher?.focus();
  }

  function start(next: WidgetConfig) {
    config = next;
    if (!config.enabled) return;
    if (config.chatUrl) chatOrigin = new URL(config.chatUrl).origin;
    window.addEventListener("message", onMessage);
    document.addEventListener("visibilitychange", () => {
      paintTitle();
      markRead();
    });
    if (showLauncher) renderLauncher();
    if (pendingOpen) {
      const options = pendingOpen;
      pendingOpen = null;
      open(options);
    }
  }

  function init(options: InitOptions) {
    if (started || !options?.teamId) return;
    started = true;
    showLauncher = options.launcher !== false;
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

  const commands: Record<string, (arg?: never) => void> = { init, open, close };

  function push(name: string, arg?: unknown) {
    commands[name]?.(arg as never);
  }

  w.FrontLit = { loaded: true, q: [], push, init, open, close };
  for (const [name, arg] of queue) push(name, arg);
})();
