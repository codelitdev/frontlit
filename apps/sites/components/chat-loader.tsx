import type { WidgetConfig } from "@/embed/types";

/**
 * The chat widget on FrontLit-hosted sites (docs/embedded-support.md §6.8):
 * the same loader external sites use, served from the site's own origin and
 * started once the page has loaded and the browser is idle. Settings are
 * inlined, so nothing goes to the embed host until the visitor opens the
 * chat. Plain inline script, no React on the client.
 */
export function ChatLoader({
  teamId,
  config,
}: {
  teamId: string;
  config: WidgetConfig;
}) {
  const init = JSON.stringify({ teamId, config }).replace(/</g, "\\u003c");
  const script = `window.FrontLit=window.FrontLit||{q:[],push(...a){this.q.push(a)}};FrontLit.push("init",${init});(function(){function l(){var s=document.createElement("script");s.src="/embed/chat.js";s.async=true;document.head.appendChild(s)}function i(){"requestIdleCallback"in window?requestIdleCallback(l,{timeout:4000}):setTimeout(l,1000)}document.readyState==="complete"?i():addEventListener("load",i,{once:true})})();`;
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
