import { describe, expect, it } from "vitest";
import { buildDocsTree, collectionHref } from "./docs-tree";

describe("buildDocsTree", () => {
  it("groups published docs under their section and keeps unsectioned last", () => {
    const tree = buildDocsTree(
      [
        {
          sectionId: "sec_a",
          name: "Getting started",
          slug: "getting-started",
          order: 0,
        },
        {
          sectionId: "sec_b",
          name: "Billing",
          slug: "billing",
          order: 1,
        },
      ],
      [
        {
          documentId: "doc_1",
          slug: "welcome",
          title: "Welcome",
          excerpt: "Intro",
          content: null,
          featuredImage: null,
          publishedAt: "2026-01-01",
          updatedAt: "2026-01-01",
          meta: {
            sectionId: "sec_a",
            order: 0,
            frontmatter: { nav_title: "Start here" },
          },
        },
        {
          documentId: "doc_2",
          slug: "refunds",
          title: "Refunds",
          excerpt: null,
          content: null,
          featuredImage: null,
          publishedAt: "2026-01-02",
          updatedAt: "2026-01-02",
          meta: { sectionId: "sec_b", order: 0 },
        },
        {
          documentId: "doc_3",
          slug: "misc",
          title: "Misc",
          excerpt: null,
          content: null,
          featuredImage: null,
          publishedAt: "2026-01-03",
          updatedAt: "2026-01-03",
          meta: { order: 0 },
        },
      ],
    );

    expect(tree.map((item) => item.slug)).toEqual(["getting-started", "billing", null]);
    expect(tree[0].items.map((item) => item.slug)).toEqual(["welcome"]);
    expect(tree[0].items[0].title).toBe("Start here");
    expect(tree[2].name).toBe("More");
    expect(collectionHref(tree[0])).toBe("/docs/collections/getting-started");
    expect(collectionHref(tree[2])).toBeNull();
  });
});
