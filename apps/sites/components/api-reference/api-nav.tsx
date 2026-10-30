"use client";

import { useState } from "react";
import { Caption, Collapsible, Text2 } from "@frontlit/page-builder/primitives/server";
import { SiteLink as Link } from "@/components/site-link";
import { MethodBadge } from "@/components/api-reference/method-badge";
import { breakAfterSlashes } from "@/components/api-reference/break-path";
import { useSiteThemeStyle } from "@/lib/site-theme-context";

export type ApiNavItem = {
  slug: string;
  title: string;
  method: string;
  deprecated?: boolean;
};

type Reference = {
  groups: {
    name: string;
    operations: { route: string; title: string; method: string; deprecated: boolean }[];
  }[];
};

/** One fetch per team and page load: every group's endpoints. */
const loads = new Map<string, Promise<Map<string, ApiNavItem[]>>>();

function loadGroups(publicApiBaseUrl: string, teamId: string) {
  let load = loads.get(teamId);
  if (!load) {
    load = fetch(`${publicApiBaseUrl}/public/${teamId}/content/api-reference`)
      .then((res) => {
        if (!res.ok) throw new Error(`API reference request failed (${res.status})`);
        return res.json() as Promise<Reference>;
      })
      .then(
        (reference) =>
          new Map(
            reference.groups.map((group) => [
              group.name,
              group.operations.map((o) => ({
                slug: o.route,
                title: o.title,
                method: o.method,
                deprecated: o.deprecated,
              })),
            ]),
          ),
      );
    // A failed load can be retried on the next interaction.
    load.catch(() => loads.delete(teamId));
    loads.set(teamId, load);
  }
  return load;
}

export function ApiNavList({
  items,
  currentSlug,
}: {
  items: ApiNavItem[];
  currentSlug: string;
}) {
  const theme = useSiteThemeStyle();
  return (
    <ul className="flex flex-col gap-1">
      {items.map((item) => {
        const isCurrent = item.slug === currentSlug;
        return (
          <li key={item.slug}>
            <Link
              href={`/docs/${item.slug}`}
              className={`flex items-start gap-2 ${isCurrent ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              aria-current={isCurrent ? "page" : undefined}
            >
              <span className="mt-1 shrink-0">
                <MethodBadge method={item.method} theme={theme} compact />
              </span>
              {/* Endpoint lists are long; the smaller body style keeps them compact. */}
              <Text2
                theme={theme}
                component="span"
                className={`min-w-0 [overflow-wrap:anywhere] ${item.deprecated ? "line-through" : ""}`}
              >
                {breakAfterSlashes(item.title)}
              </Text2>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The API reference's sidebar groups. The page carries only the current
 * group's endpoints; the others load from the public API on first use
 * (pointer, focus or a click in the sidebar), so a large spec doesn't put
 * every endpoint into every page. Without JavaScript a closed group links to
 * its section on the landing page.
 */
export function ApiNavGroups({
  teamId,
  publicApiBaseUrl,
  landingHref,
  groups,
  currentSlug,
}: {
  teamId: string;
  publicApiBaseUrl?: string;
  landingHref: string;
  /** `items` is set for groups the server rendered (the current one). */
  groups: { name: string; items: ApiNavItem[] | null }[];
  currentSlug: string;
}) {
  const theme = useSiteThemeStyle();
  const [loaded, setLoaded] = useState<Map<string, ApiNavItem[]> | null>(null);
  const load = () => {
    if (!publicApiBaseUrl || loaded || groups.every((group) => group.items)) return;
    loadGroups(publicApiBaseUrl, teamId).then(setLoaded, () => {});
  };
  return (
    <div
      className="flex flex-col gap-1 border-l border-border pl-3"
      onPointerEnter={load}
      onFocusCapture={load}
      onClickCapture={load}
    >
      {groups.map((group) => {
        const items = group.items ?? loaded?.get(group.name) ?? null;
        return (
          <Collapsible
            key={group.name}
            variant="plain"
            theme={theme}
            defaultOpen={groups.length === 1 || group.items !== null}
            summary={
              <Caption theme={theme} className="uppercase tracking-wide">
                {group.name}
              </Caption>
            }
          >
            {items ? (
              <ApiNavList items={items} currentSlug={currentSlug} />
            ) : (
              <Link
                href={`${landingHref}#${encodeURIComponent(group.name)}`}
                className="text-muted-foreground hover:text-foreground hover:underline"
              >
                <Text2 theme={theme} component="span">
                  See all {group.name} endpoints
                </Text2>
              </Link>
            )}
          </Collapsible>
        );
      })}
    </div>
  );
}
