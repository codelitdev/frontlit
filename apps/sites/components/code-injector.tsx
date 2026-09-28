"use client";

import { useEffect } from "react";

type InjectionSection = "head" | "body";

/**
 * Re-creates a team's raw HTML snippet as real DOM nodes in `<head>`/`<body>`
 * so embedded `<script>` tags actually execute — adapted from CourseLit's
 * `components/public/code-injector.tsx`. Renders on every `apps/sites` page
 * (never in the dashboard), per a team's code-injection settings
 * (architecture.md §12.5).
 */
export function CodeInjector({
  head,
  body,
}: {
  head?: string | null;
  body?: string | null;
}) {
  useEffect(() => {
    const sections: [InjectionSection, string | null | undefined][] = [
      ["head", head],
      ["body", body],
    ];

    const injected: Element[] = [];
    for (const [target, html] of sections) {
      if (!html) continue;
      const container = document.createElement("div");
      container.innerHTML = html;
      for (const child of Array.from(container.children)) {
        let node: Element = child;
        if (child.nodeName === "SCRIPT") {
          const script = document.createElement("script");
          script.innerHTML = child.innerHTML;
          for (const attr of Array.from(child.attributes)) {
            script.setAttribute(attr.nodeName, attr.nodeValue ?? "");
          }
          node = script;
        }
        document[target].appendChild(node);
        injected.push(node);
      }
    }

    return () => {
      for (const node of injected) node.remove();
    };
  }, [head, body]);

  return null;
}
