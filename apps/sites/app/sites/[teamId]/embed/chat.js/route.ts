import { getChatbotSettings } from "@/lib/api";

/**
 * The tiny loader external sites embed as
 * `<script src="https://<team-host>/embed/chat.js">` (architecture.md §7.3).
 * The team is implied by the request host — no `data-team` attribute
 * needed. Mounts a floating button that opens an iframe hosting the same
 * `/embed/chat` panel FrontLit-hosted pages use, keeping the loader itself
 * ~1 KB and isolating styles inside the iframe.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ teamId: string }> }) {
    const { teamId } = await params;
    const settings = await getChatbotSettings(teamId);
    if (!settings?.enabled) {
        return new Response("// FrontLit chat widget is disabled for this team\n", { headers: { "content-type": "application/javascript; charset=utf-8" } });
    }

    const color = settings.accentColor || "#111827";
    const name = JSON.stringify(settings.name || "Chat");

    const script = `(function () {
  var open = false;
  var button = document.createElement("button");
  button.setAttribute("aria-label", ${name});
  button.style.cssText = "position:fixed;bottom:16px;right:16px;z-index:2147483000;width:56px;height:56px;border-radius:9999px;border:0;cursor:pointer;background:${color};box-shadow:0 10px 25px rgba(0,0,0,.2);color:#fff;font-size:24px;line-height:56px;";
  button.textContent = "\\u{1F4AC}";

  var frame = document.createElement("iframe");
  frame.src = "/embed/chat";
  frame.title = ${name};
  frame.style.cssText = "position:fixed;bottom:80px;right:16px;z-index:2147483000;width:360px;max-width:90vw;height:520px;border:0;border-radius:12px;box-shadow:0 10px 25px rgba(0,0,0,.2);display:none;";

  button.addEventListener("click", function () {
    open = !open;
    frame.style.display = open ? "block" : "none";
  });

  document.body.appendChild(frame);
  document.body.appendChild(button);
})();
`;

    return new Response(script, { headers: { "content-type": "application/javascript; charset=utf-8" } });
}
