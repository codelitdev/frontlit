import { describe, expect, it } from "vitest";
import {
  filterPages,
  getPageStatusCounts,
  pagePath,
  sortPagesForLibrary,
  type PagesFilter,
} from "./pages-screen";
import type { Page } from "./api";

function page(
  pageId: string,
  name: string,
  slug: string,
  status: Page["status"],
  updatedAt: string | null = null,
): Page {
  return {
    pageId,
    name,
    slug,
    status,
    deletable: slug !== "",
    layout: [],
    draftLayout: [],
    createdAt: null,
    updatedAt,
  };
}

describe("pages screen helpers", () => {
  const pages = [
    page("home", "Homepage", "", "published"),
    page("landing", "Summer launch", "summer", "draft"),
    page("help", "Help desk", "help", "published_with_changes"),
  ];

  it("counts live pages including pages with unpublished changes", () => {
    expect(getPageStatusCounts(pages)).toEqual({
      all: 3,
      published: 2,
      draft: 1,
      changes: 1,
    });
  });

  it.each<[PagesFilter, string[]]>([
    ["all", ["home", "landing", "help"]],
    ["published", ["home", "help"]],
    ["draft", ["landing"]],
    ["changes", ["help"]],
  ])("filters the %s tab", (filter, expected) => {
    expect(filterPages(pages, filter, "").map((item) => item.pageId)).toEqual(expected);
  });

  it("matches name or slug case-insensitively", () => {
    expect(filterPages(pages, "all", "SUMMER").map((item) => item.pageId)).toEqual([
      "landing",
    ]);
    expect(filterPages(pages, "all", "help").map((item) => item.pageId)).toEqual([
      "help",
    ]);
    expect(filterPages(pages, "all", "homepage").map((item) => item.pageId)).toEqual([
      "home",
    ]);
  });

  it("keeps the homepage first and sorts the remaining pages by recent updates", () => {
    const sorted = sortPagesForLibrary([
      page("old", "Old", "old", "draft", "2026-01-01T00:00:00.000Z"),
      page("new", "New", "new", "draft", "2026-07-01T00:00:00.000Z"),
      page("home", "Homepage", "", "published", "2025-01-01T00:00:00.000Z"),
    ]);

    expect(sorted.map((item) => item.pageId)).toEqual(["home", "new", "old"]);
  });

  it("formats the homepage and regular public paths", () => {
    expect(pagePath(pages[0])).toBe("/");
    expect(pagePath(pages[1])).toBe("/summer");
  });
});
