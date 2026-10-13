import { describe, expect, it } from "vitest";
import { importDocumentationTree, type GitTreeEntry } from "./importer";

const sha = "a".repeat(40);
async function fixture(
  files: Record<string, string | Uint8Array>,
  entries: GitTreeEntry[] = [],
) {
  const blobs = new Map<string, Uint8Array>();
  const tree: GitTreeEntry[] = [{ path: "docs", mode: "040000", type: "tree", sha }];
  for (const [path, value] of Object.entries(files)) {
    const id = (tree.length + 1).toString(16).padStart(40, "0");
    const data = typeof value === "string" ? new TextEncoder().encode(value) : value;
    blobs.set(id, data);
    tree.push({
      path: `docs/${path}`,
      mode: "100644",
      type: "blob",
      sha: id,
      size: data.length,
    });
  }
  return importDocumentationTree({
    commitSha: sha,
    directory: "docs/",
    entries: [...tree, ...entries],
    readBlob: async (id) => {
      const data = blobs.get(id);
      if (!data) throw Error("missing");
      return data;
    },
  });
}
const md = (fields = "", body = "# Heading\n\nSafe content.\n") =>
  `---\ntitle: Guide\n${fields}---\n\n${body}`;
describe("immutable Git documentation manifest", () => {
  it("imports more than 500 managed files completely and rejects its explicit file limit (V27)", async () => {
    const files = Object.fromEntries(
      Array.from({ length: 501 }, (_, i) => [
        `guide-${i.toString().padStart(4, "0")}.md`,
        md(),
      ]),
    );
    const manifest = await fixture(files);
    expect(manifest.docs).toHaveLength(501);
    expect(new Set(manifest.docs.map((doc) => doc.sourcePath)).size).toBe(501);
    expect(manifest.docs[500]).toMatchObject({
      sourcePath: "docs/guide-0500.md",
      route: "/docs/guide-0500",
    });
    const oversized = Object.fromEntries(
      Array.from({ length: 1001 }, (_, i) => [`guide-${i}.md`, md()]),
    );
    await expect(fixture(oversized)).rejects.toMatchObject({
      diagnostics: [expect.objectContaining({ code: "CANDIDATE_LIMIT" })],
    });
  });
  it("derives deep routes, flat Sections, root index, defaults and inert unknown metadata", async () => {
    const manifest = await fixture({
      "a/b/c/intro.md": md("custom:\n  labels: [one, two]\n"),
      "index.md": md(),
      "a/index.md": md(),
      "private.md": md("published: false\nindexable: false\n"),
    });
    expect(manifest.docs.map((d) => d.route)).toEqual([
      "/docs/a/b/c/intro",
      "/docs/a",
      "/docs/index",
      "/docs/private",
    ]);
    expect(manifest.sections).toEqual([{ folder: "a", name: "a", order: 0 }]);
    expect(manifest.docs[0].frontmatter.custom).toEqual({ labels: ["one", "two"] });
    expect(manifest.docs[0].markdown).toContain("labels: [one, two]");
    expect(manifest.docs[3]).toMatchObject({ published: false, indexable: false });
    expect(manifest.docs[0]).toMatchObject({ published: true, indexable: true });
  });
  it("imports strict Section labels and empty Sections without generating nested Sections", async () => {
    const manifest = await fixture({
      "a/b/intro.md": md(),
      "_sections.json": JSON.stringify({
        version: 1,
        sections: [
          { folder: "empty", name: "Empty Section", order: -1 },
          { folder: "a", name: "Custom A", order: 20 },
        ],
      }),
    });
    expect(manifest.sections).toEqual([
      { folder: "empty", name: "Empty Section", order: -1 },
      { folder: "a", name: "Custom A", order: 20 },
    ]);
    for (const sections of [
      { version: 2, sections: [] },
      { version: 1, sections: [], extra: true },
      { version: 1, sections: [{ folder: "a/b", name: "A", order: 1 }] },
      {
        version: 1,
        sections: [
          { folder: "a", name: "A", order: 1 },
          { folder: "a", name: "B", order: 2 },
        ],
      },
    ]) {
      await expect(
        fixture({ "_sections.json": JSON.stringify(sections) }),
      ).rejects.toMatchObject({ diagnostics: [{ code: "INVALID_SECTIONS" }] });
    }
  });
  it("fails folder normalization collisions even when explicit slugs are distinct", async () => {
    await expect(
      fixture({
        "Support/one.md": md("slug: one\n"),
        "support/two.md": md("slug: two\n"),
      }),
    ).rejects.toMatchObject({ diagnostics: [{ code: "SECTION_COLLISION" }] });
    await expect(
      fixture({ "invalid_folder/one.md": md("slug: valid\n") }),
    ).rejects.toMatchObject({ diagnostics: [{ code: "INVALID_SLUG" }] });
  });
  it("rejects duplicate JSON metadata keys, including escaped keys", async () => {
    for (const text of [
      '{"version":1,"version":1,"sections":[]}',
      '{"version":1,"sections":[{"folder":"a","name":"A","na\\u006de":"B","order":1}]}',
    ]) {
      await expect(fixture({ "_sections.json": text })).rejects.toMatchObject({
        diagnostics: [{ code: "INVALID_SECTIONS" }],
      });
    }
  });
  it("allows verified complete directory deletion only after a prior populated import", async () => {
    const empty = {
      commitSha: sha,
      directory: "docs",
      entries: [],
      readBlob: async () => new Uint8Array(),
    };
    await expect(importDocumentationTree(empty)).rejects.toMatchObject({
      diagnostics: [{ code: "SOURCE_DIRECTORY_UNAVAILABLE" }],
    });
    expect(
      (await importDocumentationTree({ ...empty, previouslyPopulated: true })).docs,
    ).toEqual([]);
    await expect(
      importDocumentationTree({
        ...empty,
        previouslyPopulated: true,
        entries: [{ path: "docs", mode: "120000", type: "blob", sha }],
      }),
    ).rejects.toMatchObject({
      diagnostics: [{ code: "SOURCE_DIRECTORY_UNAVAILABLE" }],
    });
  });
  it("checks public collisions while preserving unpublished files for private import", async () => {
    await expect(
      fixture({ "one.md": md("slug: same\n"), "two.md": md("slug: same\n") }),
    ).rejects.toMatchObject({
      diagnostics: [{ code: "DUPLICATE_ROUTE", relatedFiles: ["docs/one.md"] }],
    });
    expect(
      (
        await fixture({
          "one.md": md("slug: same\n"),
          "two.md": md("slug: same\npublished: false\n"),
        })
      ).docs,
    ).toHaveLength(2);
    await expect(
      fixture({ "private.md": md("published: false\n", "<script>bad()</script>") }),
    ).rejects.toMatchObject({ name: "DocsContentError" });
  });
  it("distinguishes deliberate complete emptiness from missing directories, MDX and truncated resources", async () => {
    expect((await fixture({ "README.txt": "unrelated" })).docs).toEqual([]);
    await expect(fixture({ "only.mdx": "# Hidden" })).rejects.toMatchObject({
      diagnostics: [{ code: "UNSUPPORTED_NODE" }],
    });
    await expect(
      importDocumentationTree({
        commitSha: sha,
        directory: "missing",
        entries: [],
        readBlob: async () => new Uint8Array(),
      }),
    ).rejects.toMatchObject({
      diagnostics: [{ code: "SOURCE_DIRECTORY_UNAVAILABLE" }],
    });
    await expect(
      fixture({}, [{ path: "docs/link", type: "blob", mode: "120000", sha }]),
    ).rejects.toMatchObject({ diagnostics: [{ code: "INVALID_REFERENCE" }] });
    await expect(
      fixture({}, [{ path: "docs/module", type: "commit", mode: "160000", sha }]),
    ).rejects.toMatchObject({ diagnostics: [{ code: "INVALID_REFERENCE" }] });
  });
  it("rejects path traversal, non-UTF8 and binary referenced images", async () => {
    await expect(fixture({ "../escape.md": md() })).rejects.toMatchObject({
      diagnostics: [{ code: "INVALID_REFERENCE" }],
    });
    await expect(
      fixture({ "bad.md": new Uint8Array([0xff, 0xfe]) }),
    ).rejects.toMatchObject({ diagnostics: [{ code: "UNMANAGED_BINARY" }] });
    await expect(
      fixture({ "bad.md": md("", "![local](image.png)") }),
    ).rejects.toMatchObject({ diagnostics: [{ code: "UNMANAGED_BINARY" }] });
  });
});
