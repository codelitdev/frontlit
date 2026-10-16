"use client";

import type React from "react";
import { useEffect, useRef } from "react";

interface InlineEmbedProps {
  content: string;
  className?: string;
  style?: React.CSSProperties;
}

// Font stylesheets and connection hints only work at document level (a
// shadow root ignores @font-face), so these links are hoisted out of it.
const HOISTED_LINK =
  /<link\b[^>]*(?:rel=["']?(?:preconnect|dns-prefetch|preload)|href=["'][^"']*fonts?\.)[^>]*>/gi;

/**
 * Snippets are usually written as a standalone document (they used to live in
 * an iframe). Map document-level selectors onto the shadow host, drop the
 * document wrapper tags, drop "fill the frame" heights (`100vh` is now the
 * whole browser window), and drop scripts that only synced state with
 * `window.parent`, which the shadow host handles itself.
 */
export function prepareEmbed(content: string) {
  const links = content.match(HOISTED_LINK)?.join("") ?? "";
  const body = content
    .replace(HOISTED_LINK, "")
    .replace(/<!doctype[^>]*>|<\/?(?:html|head|body)\b[^>]*>/gi, "")
    .replace(
      /<script\b[^>]*>(?:(?!<\/script>)[\s\S])*window\.parent[\s\S]*?<\/script>/gi,
      "",
    )
    .replace(
      /<style\b([^>]*)>([\s\S]*?)<\/style>/gi,
      (_, attrs: string, css: string) => {
        const scoped = css
          .replace(/:root\b/g, ":host")
          .replace(/(^|[\s,{}])html\.dark\b/g, "$1:host(.dark)")
          .replace(/(^|[\s,{}])(?:html|body)(?=[\s,{:.[>~+])/g, "$1:host")
          .replace(/min-height\s*:\s*100d?vh/gi, "min-height:0");
        return `<style${attrs}>${scoped}</style>`;
      },
    );

  return { links, body };
}

function runScripts(root: ShadowRoot) {
  for (const old of root.querySelectorAll("script")) {
    const script = document.createElement("script");
    for (const { name, value } of old.attributes) script.setAttribute(name, value);
    script.textContent = old.textContent;
    old.replaceWith(script);
  }
}

/**
 * Renders a raw HTML snippet inline, inside a declarative shadow root. The
 * markup is part of the server-rendered page (so crawlers index it) while its
 * styles stay isolated from the site's in both directions.
 */
export const InlineEmbed = ({ content, className, style }: InlineEmbedProps) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const appliedRef = useRef<string | null>(null);
  const { links, body } = prepareEmbed(content);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    // A server-rendered host already has its shadow root from the HTML
    // parser; a client-rendered one (editor, client navigation) does not,
    // because innerHTML ignores declarative shadow roots.
    const root = host.shadowRoot ?? host.attachShadow({ mode: "open" });
    if (appliedRef.current === body) return;
    if (appliedRef.current !== null || !root.hasChildNodes()) root.innerHTML = body;
    appliedRef.current = body;
    runScripts(root);
  }, [body]);

  // Mirror the site's color mode onto the host so snippets can use
  // `:host(.dark)`.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const sync = () =>
      host.classList.toggle(
        "dark",
        !!host.parentElement?.closest(".dark") ||
          document.documentElement.classList.contains("dark"),
      );
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
      subtree: true,
    });
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={hostRef}
      className={className}
      style={style}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{
        // Only the HTML parser turns the template into a shadow root; on the
        // client the effect attaches it instead.
        __html:
          typeof window === "undefined"
            ? `${links}<template shadowrootmode="open">${body}</template>`
            : links,
      }}
    />
  );
};
