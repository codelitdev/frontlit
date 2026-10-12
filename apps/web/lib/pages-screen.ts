import type { Page } from "./api";

export type PagesFilter = "all" | "published" | "draft" | "changes";

export interface PageStatusCounts {
  all: number;
  published: number;
  draft: number;
  changes: number;
}

export function getPageStatusCounts(pages: Page[]): PageStatusCounts {
  return pages.reduce<PageStatusCounts>(
    (counts, page) => {
      counts.all += 1;
      if (page.status === "published" || page.status === "published_with_changes") {
        counts.published += 1;
      }
      if (page.status === "draft") counts.draft += 1;
      if (page.status === "published_with_changes") counts.changes += 1;
      return counts;
    },
    { all: 0, published: 0, draft: 0, changes: 0 },
  );
}

export function filterPages(pages: Page[], filter: PagesFilter, query: string): Page[] {
  const normalizedQuery = query.trim().toLowerCase();

  return pages.filter((page) => {
    const matchesStatus =
      filter === "all" ||
      (filter === "published" &&
        (page.status === "published" || page.status === "published_with_changes")) ||
      (filter === "draft" && page.status === "draft") ||
      (filter === "changes" && page.status === "published_with_changes");

    if (!matchesStatus) return false;
    if (!normalizedQuery) return true;

    return (
      page.name.toLowerCase().includes(normalizedQuery) ||
      page.slug.toLowerCase().includes(normalizedQuery)
    );
  });
}

export function sortPagesForLibrary(pages: Page[]): Page[] {
  return [...pages].sort((left, right) => {
    if (left.slug === "" && right.slug !== "") return -1;
    if (right.slug === "" && left.slug !== "") return 1;

    const leftTime = left.updatedAt
      ? new Date(left.updatedAt).getTime()
      : Number.NEGATIVE_INFINITY;
    const rightTime = right.updatedAt
      ? new Date(right.updatedAt).getTime()
      : Number.NEGATIVE_INFINITY;
    return rightTime - leftTime || left.name.localeCompare(right.name);
  });
}

export function pagePath(page: Pick<Page, "slug">): string {
  return page.slug ? `/${page.slug}` : "/";
}
