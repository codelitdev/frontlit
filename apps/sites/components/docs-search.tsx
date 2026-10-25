"use client";

import { useEffect, useId, useState } from "react";
import { SiteLink as Link } from "@/components/site-link";
import { Search } from "lucide-react";
import {
  Header4,
  Input,
  PageCard,
  PageCardContent,
  Text2,
} from "@frontlit/page-builder/primitives/server";
import { useSiteThemeStyle } from "@/lib/site-theme-context";

type SearchHit = {
  documentId: string;
  slug: string;
  title: string | null;
  heading: string | null;
  anchor: string | null;
  content: string;
};

export function DocsSearch({
  teamId,
  publicApiBaseUrl,
  size = "lg",
}: {
  teamId: string;
  publicApiBaseUrl: string;
  size?: "sm" | "lg";
}) {
  const theme = useSiteThemeStyle();
  const listId = useId();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "empty">("idle");

  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) {
      setHits([]);
      setStatus("idle");
      return;
    }
    setStatus("loading");
    const handle = window.setTimeout(async () => {
      try {
        const res = await fetch(
          `${publicApiBaseUrl}/public/${teamId}/content/documentation/search?q=${encodeURIComponent(q)}&k=8`,
        );
        if (!res.ok) {
          setHits([]);
          setStatus("empty");
          return;
        }
        const body = (await res.json()) as { items: SearchHit[] };
        const seen = new Set<string>();
        const unique = body.items.filter((item) =>
          seen.has(item.documentId) ? false : (seen.add(item.documentId), true),
        );
        setHits(unique);
        setStatus(unique.length === 0 ? "empty" : "idle");
        setOpen(true);
      } catch {
        setHits([]);
        setStatus("empty");
      }
    }, 250);
    return () => window.clearTimeout(handle);
  }, [publicApiBaseUrl, query, teamId]);

  return (
    <div className="relative w-full">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          theme={theme}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => hits.length > 0 && setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          placeholder="Search for articles…"
          aria-label="Search documentation"
          aria-controls={listId}
          aria-expanded={open}
          className={size === "lg" ? "h-12 pl-10 text-base shadow-sm" : "h-10 pl-10"}
        />
      </div>
      {open && (hits.length > 0 || status === "empty") && (
        <PageCard
          theme={theme}
          className="absolute z-20 mt-2 max-h-80 w-full overflow-auto shadow-lg"
        >
          <ul id={listId} role="listbox">
            {status === "empty" ? (
              <li>
                <PageCardContent theme={theme}>
                  <Text2 theme={theme}>No matching articles.</Text2>
                </PageCardContent>
              </li>
            ) : (
              hits.map((hit) => (
                <li key={hit.documentId}>
                  <Link
                    href={
                      hit.anchor
                        ? `/docs/${hit.slug}#${hit.anchor}`
                        : `/docs/${hit.slug}`
                    }
                    role="option"
                    className="block hover:bg-muted"
                  >
                    <PageCardContent theme={theme} className="flex flex-col gap-1">
                      <Header4 theme={theme}>{hit.title ?? hit.slug}</Header4>
                      {hit.heading && <Text2 theme={theme}>{hit.heading}</Text2>}
                    </PageCardContent>
                  </Link>
                </li>
              ))
            )}
          </ul>
        </PageCard>
      )}
    </div>
  );
}
