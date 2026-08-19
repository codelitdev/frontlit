import { getChatbotSettings, type ChatbotWidgetStyle } from "@/lib/api";
import { loadSiteTheme } from "@/lib/load-site-theme";

const DEFAULT_STYLE: ChatbotWidgetStyle = {
    bubbleShape: "circle",
    bubbleIcon: "chat",
    bubbleSize: "md",
    inputRadius: "full",
    inputPlaceholder: null,
    inputWidth: "md",
};

/** Built-in theme primaries (mirrors page-builder themes) for the ~1 KB loader. */
const BUILTIN_PRIMARY: Record<
    string,
    {
        primary: string;
        primaryForeground: string;
        card: string;
        border: string;
        mutedForeground: string;
    }
> = {
    classic: {
        primary: "#18181b",
        primaryForeground: "#fafafa",
        card: "#ffffff",
        border: "#e4e4de",
        mutedForeground: "#52525b",
    },
    studio: {
        primary: "#0f766e",
        primaryForeground: "#f4fffc",
        card: "#fffcf7",
        border: "#e0d8cc",
        mutedForeground: "#57534e",
    },
    neobrutalism: {
        primary: "#ffe600",
        primaryForeground: "#050505",
        card: "#ffffff",
        border: "#050505",
        mutedForeground: "#3f3f46",
    },
    editorial: {
        primary: "#1e3a8a",
        primaryForeground: "#fffaf2",
        card: "#fffaf2",
        border: "#e0d5c4",
        mutedForeground: "#5c5348",
    },
    midnight: {
        primary: "#61afef",
        primaryForeground: "#0b0d11",
        card: "#14171e",
        border: "#262b38",
        mutedForeground: "#9aa3b2",
    },
};

function resolveEmbedPalette(
    themeId: string | null,
    themeStyle: Record<string, unknown> | null,
    accentColor: string | null,
) {
    const colors = (
        themeStyle as { colors?: { light?: Record<string, string> } } | null
    )?.colors?.light;
    const builtin =
        (themeId && BUILTIN_PRIMARY[themeId]) || BUILTIN_PRIMARY.classic;
    const primary = accentColor?.trim() || colors?.primary || builtin.primary;
    return {
        primary,
        primaryForeground:
            colors?.primaryForeground || builtin.primaryForeground,
        card: colors?.card || builtin.card,
        border: colors?.border || builtin.border,
        mutedForeground: colors?.mutedForeground || builtin.mutedForeground,
    };
}

/**
 * The tiny loader external sites embed as
 * `<script src="https://<team-host>/embed/chat.js">` (architecture.md §7.3).
 * The team is implied by the request host — no `data-team` attribute
 * needed.
 *
 * - Bubble: floating button opens a classic chat iframe.
 * - Text input: a centered bottom docked iframe; the bottom field is the
 *   real composer and a message sheet grows above it (resize via postMessage).
 */
export async function GET(
    _request: Request,
    { params }: { params: Promise<{ teamId: string }> },
) {
    const { teamId } = await params;
    const [settings, siteTheme] = await Promise.all([
        getChatbotSettings(teamId),
        loadSiteTheme(teamId),
    ]);
    if (!settings?.enabled) {
        return new Response(
            "// FrontLit chat widget is disabled for this team\n",
            {
                headers: {
                    "content-type": "application/javascript; charset=utf-8",
                },
            },
        );
    }

    const palette = resolveEmbedPalette(
        siteTheme.themeId,
        siteTheme.themeStyle,
        settings.accentColor,
    );
    const color = JSON.stringify(palette.primary);
    const paletteJson = JSON.stringify(palette);
    const name = JSON.stringify(settings.name || "Chat");
    const variant = JSON.stringify(settings.variant || "bubble");
    const style = { ...DEFAULT_STYLE, ...(settings.widgetStyle ?? {}) };
    const styleJson = JSON.stringify(style);

    const script = `(function () {
  var open = false;
  var color = ${color};
  var palette = ${paletteJson};
  var name = ${name};
  var variant = ${variant};
  var style = ${styleJson};

  function bubbleSize(s) { return s === "sm" ? 48 : s === "lg" ? 64 : 56; }
  function bubbleRadius(s) { return s === "circle" ? "9999px" : s === "rounded" ? "16px" : "8px"; }
  function inputWidth(s) { return s === "sm" ? 220 : s === "lg" ? 340 : 280; }
  function iconChar(icon) {
    if (icon === "message") return "\\u{1F4AC}";
    if (icon === "sparkles") return "\\u2728";
    if (icon === "bot") return "\\u{1F916}";
    return "\\u{1F4AC}";
  }

  // --- Text-input: single docked iframe (composer + floating sheet) ---
  if (variant === "text_input") {
    var dock = document.createElement("iframe");
    dock.src = "/embed/chat?layout=docked";
    dock.title = name;
    dock.allow = "clipboard-write";
    var w = inputWidth(style.inputWidth);
    function setDockHeight(h) {
      dock.style.height = Math.max(72, h) + "px";
    }
    dock.style.cssText = "position:fixed;bottom:0;left:50%;transform:translateX(-50%);z-index:2147483000;width:"+Math.max(w, 360)+"px;max-width:calc(100vw - 16px);height:72px;border:0;background:transparent;overflow:hidden;";
    setDockHeight(72);
    window.addEventListener("message", function (ev) {
      var data = ev && ev.data;
      if (!data || data.type !== "frontlit-chat-resize") return;
      if (typeof data.height === "number") setDockHeight(data.height);
    });
    document.body.appendChild(dock);
    return;
  }

  // --- Bubble: launcher + classic panel iframe ---
  var frame = document.createElement("iframe");
  frame.src = "/embed/chat";
  frame.title = name;
  frame.style.cssText = "position:fixed;bottom:80px;right:16px;z-index:2147483000;width:360px;max-width:90vw;height:520px;border:0;border-radius:16px;box-shadow:0 10px 25px rgba(0,0,0,.2);display:none;background:#fff;";

  var launcher = document.createElement("button");
  launcher.type = "button";
  launcher.setAttribute("aria-label", name);

  function paint() {
    var size = bubbleSize(style.bubbleSize);
    launcher.style.cssText = "position:fixed;bottom:16px;right:16px;left:auto;transform:none;z-index:2147483000;width:"+size+"px;height:"+size+"px;border-radius:"+bubbleRadius(style.bubbleShape)+";border:0;cursor:pointer;background:"+color+";box-shadow:0 10px 25px rgba(0,0,0,.2);color:"+palette.primaryForeground+";font-size:22px;display:flex;align-items:center;justify-content:center;";
    launcher.textContent = open ? "\\u2715" : iconChar(style.bubbleIcon);
    frame.style.bottom = (size + 24) + "px";
    frame.style.background = palette.card;
    frame.style.display = open ? "block" : "none";
  }

  paint();
  launcher.addEventListener("click", function () {
    open = !open;
    paint();
  });

  document.body.appendChild(frame);
  document.body.appendChild(launcher);
})();
`;

    return new Response(script, {
        headers: { "content-type": "application/javascript; charset=utf-8" },
    });
}
