"use client";

import type { ChatSource } from "@/lib/use-visitor-chat";
import { publicContentPath } from "@frontlit/api-contract";
import { Caption, Text2 } from "@frontlit/page-builder/primitives/server";
import { useSiteThemeStyle } from "@/lib/site-theme-context";

export function CitationList({ sources }: { sources?: ChatSource[] | null }) {
  const theme = useSiteThemeStyle();
  if (!sources?.length) return null;
  const unique = sources.filter(
    (source, index, list) =>
      list.findIndex((item) => item.documentId === source.documentId) === index,
  );
  return (
    <div className="mt-1.5 px-1">
      <Caption theme={theme}>Sources</Caption>
      <ol className="mt-0.5 flex flex-col gap-0.5">
        {unique.map((source, index) => (
          <li key={source.documentId}>
            <a
              href={publicContentPath(source.kind, source.slug, source.anchor)}
              target="_blank"
              rel="noreferrer"
            >
              <Text2 theme={theme} className="underline">
                [{index + 1}] {source.title ?? source.slug}
              </Text2>
            </a>
          </li>
        ))}
      </ol>
    </div>
  );
}
