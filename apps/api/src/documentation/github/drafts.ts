import { eq, and } from "drizzle-orm";
import {
  DocsContentError,
  diagnostic,
  resolveDocsSourcePath,
} from "@frontlit/text-editor/docs";
import {
  documentationGitBindings as bindings,
  documentationGitFiles as files,
} from "../../db/schema";

export function normalizeGitDraftPath(path: string, directory: string) {
  if (
    path
      .split("/")
      .some((part, i, parts) => part === ".github" && parts[i + 1] === "workflows")
  )
    throw new DocsContentError([
      diagnostic("INVALID_REFERENCE", "Documentation drafts cannot modify workflows.", {
        file: path,
      }),
    ]);
  resolveDocsSourcePath(path, directory, "draft-path");
  return path;
}
/** Captured on the first local edit and retained across subsequent imports/saves.
 * Call under the documentation settings lock; client metadata never supplies bases. */
export async function gitDraftSource(
  tx: any,
  teamId: string,
  existing: any,
  requestedPath?: string,
) {
  const binding = await tx.query.documentationGitBindings.findFirst({
    where: eq(bindings.teamId, teamId),
  });
  if (!binding)
    throw new DocsContentError([
      diagnostic(
        "SOURCE_REQUIRES_GIT",
        "The Git source must be configured before saving a Git draft.",
      ),
    ]);
  let source = existing?.draftGitSource;
  if (existing && !source) {
    const file = await tx.query.documentationGitFiles.findFirst({
      where: and(eq(files.teamId, teamId), eq(files.documentId, existing.documentId)),
    });
    if (!file || file.removedAt || existing.draftHash !== file.snapshot.draftHash)
      throw new DocsContentError([
        diagnostic(
          "GIT_DRAFT_BASE_REQUIRED",
          "Reload the imported source before starting this proposal. Existing draft content is retained.",
        ),
      ]);
    source = {
      sourcePath: file.sourcePath,
      base: {
        commitSha: file.commitSha,
        sourcePath: file.sourcePath,
        sourceHash: file.sourceHash,
      },
    };
  }
  const path = requestedPath ?? source?.sourcePath;
  if (!path)
    throw new DocsContentError([
      diagnostic(
        "GIT_SOURCE_PATH_REQUIRED",
        "Choose a Markdown file path inside the configured source directory.",
        { fieldPath: "gitSourcePath" },
      ),
    ]);
  return {
    sourcePath: normalizeGitDraftPath(path, binding.directory),
    base: source?.base ?? null,
  };
}
