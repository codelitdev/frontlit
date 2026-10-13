import { createHash } from "node:crypto";
import {
  DocsContentError,
  DOCS_LIMITS,
  diagnostic,
  normalizeDocsSourceDirectory,
  resolveDocsSourcePath,
} from "@frontlit/text-editor/docs";
import {
  GIT_DOCS_LIMITS,
  importDocumentationTree,
  type GitTreeEntry,
} from "./importer";

/** Private captured input. Source bases must come from stored draft provenance. */
export type CapturedGitChange = {
  documentId: string;
  draftVersion: number;
  base: { commitSha: string; sourcePath: string; sourceHash: string } | null;
  target: { sourcePath: string; markdown: string } | null;
};
function fail(code: string, message: string, file?: string): never {
  throw new DocsContentError([diagnostic(code, message, { file })]);
}
export const gitSourceHash = (text: Uint8Array | string) =>
  createHash("sha256").update(text).digest("hex");
const blobHash = (text: Uint8Array) =>
  createHash("sha1").update(`blob ${text.byteLength}\0`).update(text).digest("hex");

/** Read-only planning: verify selected file bases against current head, then import
 * the entire proposed tree. Unrelated head changes are retained byte-for-byte. */
export async function planGitProposalPatch(input: {
  commitSha: string;
  directory: string;
  entries: GitTreeEntry[];
  changes: CapturedGitChange[];
  readBlob: (sha: string) => Promise<Uint8Array>;
}) {
  const directory = normalizeDocsSourceDirectory(input.directory);
  if (!/^[a-f0-9]{40}$/.test(input.commitSha))
    fail("INVALID_REFERENCE", "An immutable publishing-branch head is required.");
  if (input.entries.length > GIT_DOCS_LIMITS.entries)
    fail("CANDIDATE_LIMIT", "Repository tree exceeds the supported size.");
  if (!input.changes.length || input.changes.length > 1000)
    fail("INVALID_PROPOSAL", "Select between one and one thousand documents.");
  const original = new Map(input.entries.map((entry) => [entry.path, entry]));
  if (original.size !== input.entries.length)
    fail("INVALID_REFERENCE", "The complete repository tree contains duplicate paths.");
  const selectedIds = new Set<string>(),
    selectedPaths = new Set<string>(),
    targetPaths = new Set<string>();
  const cache = new Map<string, Uint8Array>();
  let readBytes = 0;
  async function readBlob(sha: string) {
    let value = cache.get(sha);
    if (!value) {
      value = await input.readBlob(sha);
      readBytes += value.byteLength;
      if (value.byteLength > DOCS_LIMITS.bytes || readBytes > GIT_DOCS_LIMITS.bytes)
        fail(
          "CANDIDATE_LIMIT",
          "Source text exceeds the documentation candidate limits.",
        );
      cache.set(sha, value);
    }
    return value;
  }
  const checkPath = (path: string) => {
    if (
      path
        .split("/")
        .some((part, i, parts) => part === ".github" && parts[i + 1] === "workflows")
    )
      fail(
        "INVALID_REFERENCE",
        "Documentation proposals cannot modify workflows.",
        path,
      );
    resolveDocsSourcePath(path, directory, "proposal-path");
  };
  for (const change of input.changes) {
    if (
      !change.documentId ||
      !Number.isSafeInteger(change.draftVersion) ||
      change.draftVersion < 1 ||
      selectedIds.has(change.documentId)
    )
      fail(
        "INVALID_PROPOSAL",
        "Capture each document and its exact draft version once.",
      );
    selectedIds.add(change.documentId);
    if (!change.base && !change.target)
      fail("INVALID_PROPOSAL", "A new document cannot be a removal.");
    if (change.base) {
      checkPath(change.base.sourcePath);
      if (
        !/^[a-f0-9]{40}$/.test(change.base.commitSha) ||
        !/^[a-f0-9]{64}$/.test(change.base.sourceHash)
      )
        fail(
          "INVALID_REFERENCE",
          "Stored source provenance is required.",
          change.base.sourcePath,
        );
      if (selectedPaths.has(change.base.sourcePath))
        fail(
          "INVALID_PROPOSAL",
          "A source file was selected more than once.",
          change.base.sourcePath,
        );
      selectedPaths.add(change.base.sourcePath);
      const entry = original.get(change.base.sourcePath);
      if (
        !entry ||
        entry.type !== "blob" ||
        !["100644", "100755"].includes(entry.mode) ||
        gitSourceHash(await readBlob(entry.sha)) !== change.base.sourceHash
      )
        fail(
          "UPSTREAM_CHANGED",
          "The selected source file changed upstream. The local draft is preserved.",
          change.base.sourcePath,
        );
    }
    if (change.target) {
      checkPath(change.target.sourcePath);
      if (targetPaths.has(change.target.sourcePath))
        fail(
          "INVALID_PROPOSAL",
          "Proposed files must have unique paths.",
          change.target.sourcePath,
        );
      targetPaths.add(change.target.sourcePath);
      if (
        change.target.sourcePath !== change.base?.sourcePath &&
        original.has(change.target.sourcePath)
      )
        fail(
          "UPSTREAM_CHANGED",
          "The proposed new path already exists upstream.",
          change.target.sourcePath,
        );
    }
  }
  const candidate = new Map(original);
  const edits: { path: string; mode: string; content: string | null }[] = [];
  for (const change of input.changes) {
    if (change.base && change.base.sourcePath !== change.target?.sourcePath) {
      candidate.delete(change.base.sourcePath);
      edits.push({
        path: change.base.sourcePath,
        mode: original.get(change.base.sourcePath)!.mode,
        content: null,
      });
    }
    if (!change.target) continue;
    const { sourcePath: path, markdown } = change.target;
    const bytes = new TextEncoder().encode(markdown),
      sha = blobHash(bytes);
    const mode = change.base?.sourcePath === path ? original.get(path)!.mode : "100644";
    for (let i = 1; i < path.split("/").length; i++) {
      const ancestor = path.split("/").slice(0, i).join("/");
      const prior = candidate.get(ancestor);
      if (prior && (prior.type !== "tree" || prior.mode !== "040000"))
        fail(
          "INVALID_REFERENCE",
          "A proposed path traverses a non-directory.",
          ancestor,
        );
      if (!prior)
        candidate.set(ancestor, {
          path: ancestor,
          mode: "040000",
          type: "tree",
          sha: "0".repeat(40),
        });
    }
    candidate.set(path, { path, mode, type: "blob", sha, size: bytes.byteLength });
    cache.set(sha, bytes);
    edits.push({ path, mode, content: markdown });
  }
  const manifest = await importDocumentationTree({
    commitSha: input.commitSha,
    directory,
    entries: [...candidate.values()],
    previouslyPopulated: true,
    readBlob,
  });
  return { baseSha: input.commitSha, edits, manifest };
}
