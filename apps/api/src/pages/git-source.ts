import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { documentationGitBindings as bindings } from "../db/schema";
import type { AuthzContext } from "../auth/authorize";
import { lockSettings } from "../documentation/authoring";
import {
  DocsGitHubApp,
  getDocsGitHubAppConfig,
  GitHubDocsError,
} from "../documentation/github/app";
import { requireGitManager } from "../documentation/github/setup";
import { enqueueGitSync, readGitBindingAccess } from "../documentation/github/state";
import {
  importPagesTree,
  normalizePagesDirectory,
  PagesImportError,
  siteFilePath,
} from "./git-import";
import type { GitTreeEntry } from "../documentation/github/importer";
import { getActiveRelease } from "./releases";

async function connectedBinding(teamId: string) {
  const binding = await db.query.documentationGitBindings.findFirst({
    where: eq(bindings.teamId, teamId),
  });
  if (binding?.status !== "connected")
    throw new GitHubDocsError("SOURCE_REQUIRES_GIT", 409);
  return binding;
}

/** Dry run: imports the folder at `commitSha` without changing anything
 * (repo images aren't uploaded). `missing` means the folder doesn't exist. */
export async function previewPagesTree(
  teamId: string,
  input: {
    commitSha: string;
    directory: string;
    entries: GitTreeEntry[];
    readBlob: (sha: string) => Promise<Uint8Array>;
  },
) {
  const directory = normalizePagesDirectory(input.directory);
  const base = {
    commitSha: input.commitSha,
    directory,
    siteFile: siteFilePath(directory),
    hasSiteFile: input.entries.some((entry) => entry.path === siteFilePath(directory)),
  };
  const active = await getActiveRelease(teamId);
  try {
    const manifest = await importPagesTree({
      teamId,
      commitSha: input.commitSha,
      directory,
      entries: input.entries,
      readBlob: input.readBlob,
      dryRun: true,
    });
    const slugs = new Set(
      manifest.pages.filter((page) => page.published).map((page) => page.slug),
    );
    return {
      ...base,
      publishable: true,
      missing: false,
      pages: manifest.pages.map((page) => ({
        path: page.path,
        route: `/${page.slug}`,
        title: page.document.title ?? null,
        published: page.published,
      })),
      removedPages: (active?.pages ?? [])
        .filter((page) => !slugs.has(page.slug))
        .map((page) => ({ name: page.name, route: `/${page.slug}` })),
      diagnostics: manifest.diagnostics,
    };
  } catch (error) {
    if (!(error instanceof PagesImportError)) throw error;
    return {
      ...base,
      publishable: false,
      missing: error.diagnostics.some((d) => d.code === "PAGES_DIRECTORY_MISSING"),
      pages: [],
      removedPages: [],
      diagnostics: error.diagnostics,
    };
  }
}

export async function previewGitPages(
  teamId: string,
  actor: AuthzContext,
  input: { directory: string },
  app = new DocsGitHubApp(getDocsGitHubAppConfig()),
) {
  requireGitManager(teamId, actor);
  const binding = await connectedBinding(teamId);
  const access = await readGitBindingAccess(binding, app);
  const owner = access.repository.owner.login;
  const name = access.repository.name;
  const commitSha = await app.branchHead(access.token, owner, name, binding.branch);
  return previewPagesTree(teamId, {
    commitSha,
    directory: input.directory,
    entries: await app.commitTree(access.token, owner, name, commitSha),
    readBlob: (sha) => app.blob(access.token, owner, name, sha),
  });
}

/** Turns the pages source on and syncs right away. */
export async function enableGitPages(
  teamId: string,
  actor: AuthzContext,
  input: { directory: string; commitSha: string },
) {
  requireGitManager(teamId, actor, true);
  const directory = normalizePagesDirectory(input.directory);
  await db.transaction(async (tx) => {
    await lockSettings(tx, teamId);
    const [updated] = await tx
      .update(bindings)
      .set({
        pagesDirectory: directory,
        pagesSourceKey: null,
        pagesDiagnostics: null,
        updatedAt: new Date(),
      })
      .where(eq(bindings.teamId, teamId))
      .returning();
    if (updated?.status !== "connected")
      throw new GitHubDocsError("SOURCE_REQUIRES_GIT", 409);
    await enqueueGitSync(
      teamId,
      { reviewedSha: input.commitSha, trigger: "configuration" },
      tx,
    );
  });
  return { pagesDirectory: directory };
}

/** Hands pages back to the builder; the live release stays as it is. */
export async function disableGitPages(teamId: string, actor: AuthzContext) {
  requireGitManager(teamId, actor, true);
  await db.transaction(async (tx) => {
    await lockSettings(tx, teamId);
    const binding = await tx.query.documentationGitBindings.findFirst({
      where: eq(bindings.teamId, teamId),
    });
    if (!binding) throw new GitHubDocsError("SOURCE_REQUIRES_GIT", 409);
    await tx
      .update(bindings)
      .set({
        pagesDirectory: null,
        pagesSourceKey: null,
        pagesDiagnostics: null,
        updatedAt: new Date(),
      })
      .where(eq(bindings.teamId, teamId));
  });
  return { pagesDirectory: null };
}
