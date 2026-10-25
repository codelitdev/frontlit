import path from "node:path";

/**
 * Modules that must run in the browser on server-rendered pages. Keyed by the
 * file's path under `src/` (no extension); the value is the island's output
 * name under `dist/server/islands/`.
 *
 * Each island is bundled on its own and marked `"use client"`. The server
 * entry imports them by that output path instead of bundling them, so React
 * keeps the client boundary. Everything an island receives from the server
 * must be serialisable. `nav-link` and `theme-mode-switcher` are also public
 * (`@frontlit/page-builder/islands/*`) so hosts can use them without loading
 * the full client bundle.
 */
export const islands: Record<string, string> = {
  "components/nav-link": "nav-link",
  "components/theme-mode-switcher": "theme-mode-switcher",
  "components/inline-embed": "inline-embed",
  "components/video-with-preview": "video-with-preview",
  "primitives/code-snippet": "code-snippet",
  "blocks/header/mobile-menu": "header-mobile-menu",
  "blocks/header/github-stars": "header-github-stars",
  "blocks/marquee/marquee-track": "marquee-track",
  "blocks/pricing/period-switch": "pricing-period-switch",
  "blocks/email-form/form": "email-form",
  "blocks/support-form/form": "support-form",
};

export const srcDir = path.resolve("src");
