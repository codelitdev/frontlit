import { describe, expect, it, vi } from "vitest";
import {
  gitSourceHash,
  planGitProposalPatch,
  type CapturedGitChange,
} from "./proposal-patch";
import type { GitTreeEntry } from "./importer";
const sha = "a".repeat(40),
  nextSha = "b".repeat(40),
  firstBlob = "c".repeat(40),
  secondBlob = "d".repeat(40);
const first = "---\ntitle: First\nslug: first\n---\n\nOriginal body\n";
const second = "---\ntitle: Second\nslug: second\n---\n\nUntouched\r\n";
function fixture() {
  const entries: GitTreeEntry[] = [
    { path: "docs", type: "tree", mode: "040000", sha },
    { path: "docs/first.md", type: "blob", mode: "100755", sha: firstBlob },
    { path: "docs/second.md", type: "blob", mode: "100644", sha: secondBlob },
    { path: "app.ts", type: "blob", mode: "100644", sha: "e".repeat(40) },
  ];
  const readBlob = vi.fn(async (value: string) =>
    new TextEncoder().encode(value === firstBlob ? first : second),
  );
  const change: CapturedGitChange = {
    documentId: "doc_first",
    draftVersion: 3,
    base: {
      commitSha: sha,
      sourcePath: "docs/first.md",
      sourceHash: gitSourceHash(first),
    },
    target: {
      sourcePath: "docs/first.md",
      markdown: first.replace("Original body", "Captured body"),
    },
  };
  return { entries, readBlob, change };
}
describe("captured Git proposal patches", () => {
  it("allows unrelated branch changes, preserves untouched bytes, validates the entire candidate and emits only selected edits", async () => {
    const { entries, readBlob, change } = fixture();
    const result = await planGitProposalPatch({
      commitSha: nextSha,
      directory: "docs",
      entries,
      changes: [change],
      readBlob,
    });
    expect(result.baseSha).toBe(nextSha);
    expect(result.edits).toEqual([
      { path: "docs/first.md", mode: "100755", content: change.target!.markdown },
    ]);
    expect(
      result.manifest.docs.find((d) => d.sourcePath === "docs/second.md")!.markdown,
    ).toBe(second);
    expect(readBlob).not.toHaveBeenCalledWith("e".repeat(40));
    change.target!.markdown = "Later local change";
    expect(result.edits[0].content).toContain("Captured body");
  });
  it("rejects selected upstream changes without merging or mutating captured input", async () => {
    const { entries, readBlob, change } = fixture();
    readBlob.mockResolvedValue(new TextEncoder().encode(first + "Upstream edit"));
    await expect(
      planGitProposalPatch({
        commitSha: nextSha,
        directory: "docs",
        entries,
        changes: [change],
        readBlob,
      }),
    ).rejects.toMatchObject({
      diagnostics: [expect.objectContaining({ code: "UPSTREAM_CHANGED" })],
    });
    expect(change.target!.markdown).toContain("Captured body");
  });
  it("captures path moves as one removal plus one addition and refuses occupied destinations", async () => {
    const { entries, readBlob, change } = fixture();
    change.target!.sourcePath = "docs/guides/moved.md";
    const result = await planGitProposalPatch({
      commitSha: nextSha,
      directory: "docs",
      entries,
      changes: [change],
      readBlob,
    });
    expect(result.edits.map((e) => [e.path, e.content === null])).toEqual([
      ["docs/first.md", true],
      ["docs/guides/moved.md", false],
    ]);
    expect(result.manifest.docs.map((d) => d.sourcePath)).toEqual([
      "docs/guides/moved.md",
      "docs/second.md",
    ]);
    change.target!.sourcePath = "docs/second.md";
    await expect(
      planGitProposalPatch({
        commitSha: nextSha,
        directory: "docs",
        entries,
        changes: [change],
        readBlob,
      }),
    ).rejects.toMatchObject({
      diagnostics: [expect.objectContaining({ code: "UPSTREAM_CHANGED" })],
    });
  });
  it("rejects unsafe paths, workflows, duplicate selections and whole-candidate route conflicts", async () => {
    const { entries, readBlob, change } = fixture();
    for (const path of [
      "outside.md",
      "docs/../outside.md",
      "docs/.github/workflows/run.md",
      "docs/binary.png",
    ]) {
      await expect(
        planGitProposalPatch({
          commitSha: sha,
          directory: "docs",
          entries,
          changes: [{ ...change, target: { sourcePath: path, markdown: first } }],
          readBlob,
        }),
      ).rejects.toMatchObject({
        diagnostics: [expect.objectContaining({ code: "INVALID_REFERENCE" })],
      });
    }
    await expect(
      planGitProposalPatch({
        commitSha: sha,
        directory: "docs",
        entries,
        changes: [change, change],
        readBlob,
      }),
    ).rejects.toMatchObject({
      diagnostics: [expect.objectContaining({ code: "INVALID_PROPOSAL" })],
    });
    change.target!.markdown = first.replace("slug: first", "slug: second");
    await expect(
      planGitProposalPatch({
        commitSha: sha,
        directory: "docs",
        entries,
        changes: [change],
        readBlob,
      }),
    ).rejects.toMatchObject({
      diagnostics: [expect.objectContaining({ code: "DUPLICATE_ROUTE" })],
    });
  });
  it("validates unchanged documents too, and supports selected removal without any Git writes", async () => {
    const { entries, readBlob, change } = fixture();
    change.target = null;
    const result = await planGitProposalPatch({
      commitSha: sha,
      directory: "docs",
      entries,
      changes: [change],
      readBlob,
    });
    expect(result.edits).toEqual([
      { path: "docs/first.md", mode: "100755", content: null },
    ]);
    expect(result.manifest.docs).toHaveLength(1);
    readBlob.mockImplementation(async (value) =>
      new TextEncoder().encode(
        value === firstBlob ? first : "---\ntitle: Bad\n---\n<script>bad</script>",
      ),
    );
    await expect(
      planGitProposalPatch({
        commitSha: sha,
        directory: "docs",
        entries,
        changes: [change],
        readBlob,
      }),
    ).rejects.toBeDefined();
  });
});
