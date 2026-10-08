import { describe, expect, it } from "vitest";
import {
  filterDocs,
  getDocStatusCounts,
  groupDocsBySection,
  type DocsFilter,
} from "./docs-screen";
import type { DocumentationSection, DocumentationPage } from "./api";

function doc(
  documentId: string,
  title: string,
  slug: string,
  status: DocumentationPage["status"],
  sectionId?: string,
  order = 0,
): DocumentationPage {
  return {
    draftVersion: 1,
    draftSlug: null,
    documentId,
    slug,
    status,
    draftTitle: title,
    draftContent: { type: "doc", content: [] },
    draftMeta: { sectionId, order },
    meta: { order: 0 },
    createdAt: null,
    updatedAt: null,
  };
}

const sections: DocumentationSection[] = [
  {
    sectionId: "guides",
    name: "Guides",
    slug: "guides",
    order: 1,
    createdAt: null,
    updatedAt: null,
  },
  {
    sectionId: "api",
    name: "API reference",
    slug: "api-reference",
    order: 2,
    createdAt: null,
    updatedAt: null,
  },
];

describe("docs screen helpers", () => {
  const docs = [
    doc("one", "Getting started", "start-here", "published", "guides", 2),
    doc("two", "Authentication", "api-auth", "draft", "api", 1),
    doc("three", "Webhooks", "webhooks", "published_with_changes", "api", 0),
    doc("four", "Loose note", "loose-note", "draft"),
  ];

  it("counts each document status", () => {
    expect(getDocStatusCounts(docs)).toEqual({
      all: 4,
      published: 2,
      draft: 2,
      changes: 1,
    });
  });

  it.each<[DocsFilter, string[]]>([
    ["all", ["one", "two", "three", "four"]],
    ["published", ["one", "three"]],
    ["draft", ["two", "four"]],
    ["changes", ["three"]],
  ])("filters the %s tab", (filter, expected) => {
    expect(filterDocs(docs, filter, "").map((item) => item.documentId)).toEqual(
      expected,
    );
  });

  it("matches title or slug case-insensitively", () => {
    expect(filterDocs(docs, "all", "API-AUTH").map((item) => item.documentId)).toEqual([
      "two",
    ]);
    expect(filterDocs(docs, "all", "webhooks").map((item) => item.documentId)).toEqual([
      "three",
    ]);
  });

  it("groups by configured section order and places unknown docs in Unsectioned", () => {
    const groups = groupDocsBySection(docs, sections);

    expect(groups.map((group) => group.name)).toEqual([
      "Guides",
      "API reference",
      "Unsectioned",
    ]);
    expect(groups[1].docs.map((item) => item.documentId)).toEqual(["three", "two"]);
    expect(groups[2].docs.map((item) => item.documentId)).toEqual(["four"]);
  });
});
