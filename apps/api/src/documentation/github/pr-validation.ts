import { and, eq } from "drizzle-orm";
import {
  DocsContentError,
  diagnostic,
  type DocsDiagnostic,
} from "@frontlit/text-editor/docs";
import { db } from "../../db/client";
import { documentationGitBindings as bindings } from "../../db/schema";
import { lockSettings } from "../authoring";
import { DocsGitHubApp, GitHubDocsError } from "./app";
import { importDocumentationTree } from "./importer";
import { validateGitManifest } from "./source";
import { readGitBindingAccess, type GitBinding } from "./state";

export type GitPullRequestValidation = {
  docsDraftVersion: number;
  policyEpoch: number;
  purgeGeneration: number;
  number: number;
  headSha: string;
  baseSha: string;
  mergeSha: string | null;
  outcome: "valid" | "invalid" | "incomplete";
  fileCount: number;
  publishedCount: number;
  diagnostics: DocsDiagnostic[];
};
async function assertSource(
  binding: GitBinding,
  expected?: { docsDraftVersion: number; policyEpoch: number; purgeGeneration: number },
) {
  return db.transaction(async (tx) => {
    const settings = await lockSettings(tx, binding.teamId);
    const current = await tx.query.documentationGitBindings.findFirst({
      where: and(
        eq(bindings.teamId, binding.teamId),
        eq(bindings.generation, binding.generation),
      ),
    });
    if (
      settings.source !== "git" ||
      !current ||
      current.status !== "connected" ||
      !current.capabilities.read ||
      current.installationId !== binding.installationId ||
      current.repositoryId !== binding.repositoryId ||
      current.ownerId !== binding.ownerId ||
      current.branch !== binding.branch ||
      current.directory !== binding.directory ||
      (expected &&
        (settings.draftVersion !== expected.docsDraftVersion ||
          settings.policyEpoch !== expected.policyEpoch ||
          settings.purgeGeneration !== expected.purgeGeneration))
    )
      throw new GitHubDocsError("GITHUB_SUPERSEDED", 409);
    return {
      docsDraftVersion: settings.draftVersion,
      policyEpoch: settings.policyEpoch,
      purgeGeneration: settings.purgeGeneration,
    };
  });
}

/** Validate the provider's immutable proposed merge, never only a PR head.
 * This entry point reads Git/content policy only and performs no embeddings,
 * publication activation, PR writes or check delivery. Callers persist the result
 * under their own lease and retry reporting independently. */
export async function validateGitPullRequest(
  binding: GitBinding,
  number: number,
  app: DocsGitHubApp,
  heartbeat: () => Promise<void> = async () => {},
): Promise<GitPullRequestValidation> {
  const policy = await assertSource(binding);
  const access = await readGitBindingAccess(binding, app);
  const { token } = await app.installationToken(
    Number(binding.installationId),
    Number(binding.repositoryId),
    "review",
  );
  const owner = access.repository.owner.login,
    name = access.repository.name;
  const input = {
    number,
    repositoryId: Number(binding.repositoryId),
    base: binding.branch,
  };
  const candidate = await app.pullRequestCandidate(token, owner, name, input);
  const publishingHead = await app.branchHead(token, owner, name, binding.branch);
  const result: GitPullRequestValidation = {
    ...policy,
    number,
    headSha: candidate.headSha,
    baseSha: publishingHead,
    mergeSha: candidate.mergeSha,
    outcome: "incomplete",
    fileCount: 0,
    publishedCount: 0,
    diagnostics: [],
  };
  let unavailable: string | null = null;
  if (candidate.state !== "open" || candidate.merged) unavailable = "GITHUB_PR_CLOSED";
  else if (!candidate.supported) unavailable = "GITHUB_FORK_UNSUPPORTED";
  else if (candidate.mergeable === false) unavailable = "GITHUB_PR_MERGE_CONFLICT";
  else if (candidate.mergeable === null || !candidate.mergeSha)
    unavailable = "GITHUB_PR_MERGE_PENDING";
  if (unavailable) {
    result.outcome =
      unavailable === "GITHUB_PR_MERGE_CONFLICT" ? "invalid" : "incomplete";
    result.diagnostics = [
      diagnostic(
        unavailable,
        "The complete proposed merge cannot currently be validated.",
      ),
    ];
  } else {
    await heartbeat();
    const merge = await app.commit(token, owner, name, candidate.mergeSha!);
    if (
      merge.parents?.length !== 2 ||
      merge.parents[0].sha !== publishingHead ||
      merge.parents[1].sha !== candidate.headSha
    )
      throw new GitHubDocsError("GITHUB_PR_CHANGED", 409);
    try {
      const entries = await app.tree(token, owner, name, merge.tree.sha);
      const manifest = await importDocumentationTree({
        commitSha: candidate.mergeSha!,
        directory: binding.directory,
        entries,
        // An established binding can intentionally remove every managed file.
        previouslyPopulated: true,
        readBlob: async (sha) => {
          await heartbeat();
          return app.blob(token, owner, name, sha);
        },
      });
      const report = await validateGitManifest(binding.teamId, manifest);
      result.outcome = report.publishable ? "valid" : "invalid";
      result.fileCount = manifest.docs.length;
      result.publishedCount = manifest.docs.filter((doc) => doc.published).length;
      result.diagnostics = report.diagnostics;
    } catch (error) {
      if (!(error instanceof DocsContentError)) throw error;
      result.outcome = "invalid";
      result.diagnostics = error.diagnostics;
    }
  }
  await heartbeat();
  const refreshed = await app.pullRequestCandidate(token, owner, name, input);
  const currentBase = await app.branchHead(token, owner, name, binding.branch);
  if (
    refreshed.headSha !== candidate.headSha ||
    refreshed.baseSha !== candidate.baseSha ||
    refreshed.mergeSha !== candidate.mergeSha ||
    refreshed.state !== candidate.state ||
    refreshed.merged !== candidate.merged ||
    refreshed.supported !== candidate.supported ||
    refreshed.mergeable !== candidate.mergeable ||
    (candidate.state === "open" && !candidate.merged && currentBase !== publishingHead)
  )
    throw new GitHubDocsError("GITHUB_PR_CHANGED", 409);
  await assertSource(binding, policy);
  return result;
}
