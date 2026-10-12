import { describe, expect, it } from "vitest";
import {
  filterBlogPosts,
  getBlogStatusCounts,
  sortBlogPostsByUpdatedAt,
  type BlogFilter,
} from "./blog-screen";
import type { Article } from "./api";

function post(
  documentId: string,
  title: string,
  slug: string,
  status: Article["status"],
  tags: string[] = [],
  updatedAt: string | null = null,
): Article {
  return {
    documentId,
    slug,
    status,
    draftTitle: title,
    draftContent: { type: "doc", content: [] },
    draftMeta: { tags },
    meta: { tags: [] },
    createdAt: null,
    updatedAt,
  };
}

describe("blog screen helpers", () => {
  const posts = [
    post("one", "Launch notes", "launch-notes", "published", ["Product"]),
    post("two", "Engineering update", "eng-update", "draft", ["Engineering"]),
    post("three", "Summer release", "summer-release", "published_with_changes", [
      "Release",
    ]),
  ];

  it("counts live posts including posts with unpublished changes", () => {
    expect(getBlogStatusCounts(posts)).toEqual({
      all: 3,
      published: 2,
      draft: 1,
      changes: 1,
    });
  });

  it.each<[BlogFilter, string[]]>([
    ["all", ["one", "two", "three"]],
    ["published", ["one", "three"]],
    ["draft", ["two"]],
    ["changes", ["three"]],
  ])("filters the %s tab", (filter, expected) => {
    expect(filterBlogPosts(posts, filter, "").map((item) => item.documentId)).toEqual(
      expected,
    );
  });

  it("matches title, slug, or tag case-insensitively", () => {
    expect(
      filterBlogPosts(posts, "all", "ENG-UPDATE").map((item) => item.documentId),
    ).toEqual(["two"]);
    expect(
      filterBlogPosts(posts, "all", "release").map((item) => item.documentId),
    ).toEqual(["three"]);
    expect(
      filterBlogPosts(posts, "all", "product").map((item) => item.documentId),
    ).toEqual(["one"]);
  });

  it("sorts most recently updated posts first and keeps missing dates last", () => {
    const sorted = sortBlogPostsByUpdatedAt([
      post("old", "Old", "old", "draft", [], "2026-01-01T00:00:00.000Z"),
      post("none", "None", "none", "draft"),
      post("new", "New", "new", "draft", [], "2026-07-01T00:00:00.000Z"),
    ]);

    expect(sorted.map((item) => item.documentId)).toEqual(["new", "old", "none"]);
  });
});
