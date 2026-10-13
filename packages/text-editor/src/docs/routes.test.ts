import { describe, expect, it } from "vitest";
import {
  normalizeDocsSlug,
  normalizeDocsSourceDirectory,
  resolveDocsSourcePath,
} from "./routes";
import { hashDocsContent } from "./hash";

describe("DM-ROUTE / DM-SOURCE source mapping", () => {
  it.each([
    ["manual/getting-started.md", "/docs/getting-started", null],
    ["manual/support/inbox.md", "/docs/support/inbox", "support"],
    ["manual/support/index.md", "/docs/support", "support"],
    ["manual/index.md", "/docs/index", null],
    ["manual/a/b/c/d/e/f/g/h/intro.md", "/docs/a/b/c/d/e/f/g/h/intro", "a"],
  ])(
    "V12: retains deep paths with only a first-level Section",
    (path, route, sectionSlug) => {
      expect(resolveDocsSourcePath(path, "manual")).toMatchObject({
        route,
        sectionSlug,
      });
    },
  );
  it("DM-ROUTE: overrides change URL independently of organization", () => {
    expect(
      resolveDocsSourcePath("manual/support/index.md", "manual", "Help/Setup/"),
    ).toMatchObject({ route: "/docs/help/setup", sectionSlug: "support" });
  });
  it.each([
    "",
    "/setup",
    "a//b",
    "a/../b",
    "a/./b",
    "a?query",
    "a#fragment",
    "https://host",
    "a%2fb",
    "世界",
    "collections/a",
    "search",
    "a//",
  ])("V03: rejects malformed/reserved route %s", (value) => {
    expect(() => normalizeDocsSlug(value)).toThrow();
  });
  it.each([
    "../manual",
    "/manual",
    "manual//nested",
    "manual/../private",
    "manual\\private",
  ])("DM-SOURCE: confines the source directory to the repository", (value) => {
    expect(() => normalizeDocsSourceDirectory(value)).toThrow();
  });
  it("DM-SOURCE: does not treat a prefix sibling as part of the managed directory", () => {
    expect(() => resolveDocsSourcePath("manual-private/a.md", "manual")).toThrow();
    expect(() => resolveDocsSourcePath("manual/../private/a.md", "manual")).toThrow();
  });
  it("DM-CONVERT: stable hashes include the embedding configuration version", async () => {
    const input = {
      content: { type: "doc" },
      metadata: { title: "Example", published: true },
      embeddingConfigurationVersion: "disabled-v1",
    };
    const first = await hashDocsContent(input);
    expect(
      await hashDocsContent({
        ...input,
        metadata: { published: true, title: "Example" },
      }),
    ).toBe(first);
    expect(
      await hashDocsContent({ ...input, embeddingConfigurationVersion: "enabled-v2" }),
    ).not.toBe(first);
  });
});
