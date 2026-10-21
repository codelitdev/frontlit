import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { serializePageFile, serializeSiteFile } from "@frontlit/page-builder/schema";
import { db } from "../db/client";
import {
  documentationGitBindings as bindings,
  pagePullRequests,
  pages,
} from "../db/schema";
import {
  DocsGitHubApp,
  getDocsGitHubAppConfig,
  GitHubDocsError,
} from "../documentation/github/app";
import { readGitBindingAccess, type GitBinding } from "../documentation/github/state";
import { normalizePagesDirectory, siteFilePath } from "./git-import";
import { pageFilePath } from "./git-pr";
import { draftDocument, getActiveRelease } from "./releases";

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

/**
 * Canonical files for every page: live pages as published, builder-only
 * drafts as `published: false`, plus `site.json` with the live chrome,
 * theme and redirects. Re-importing them reproduces the same revisions.
 */
export async function exportPagesFiles(teamId: string, directory: string) {
  const release = await getActiveRelease(teamId);
  const files: { path: string; content: string }[] = [];
  const exported = new Set<string>();
  for (const entry of release?.pages ?? []) {
    exported.add(entry.slug);
    files.push({
      path: pageFilePath(directory, entry.slug),
      content: serializePageFile(entry.revision.content),
    });
  }
  const drafts = await db.query.pages.findMany({ where: eq(pages.teamId, teamId) });
  for (const page of drafts) {
    if (exported.has(page.slug)) continue;
    files.push({
      path: pageFilePath(directory, page.slug),
      content: serializePageFile({ ...draftDocument(page), published: false }),
    });
  }
  if (release)
    files.push({
      path: siteFilePath(directory),
      content: serializeSiteFile({
        header: release.site.header,
        footer: release.site.footer,
        ...(release.site.theme ? { theme: release.site.theme as any } : {}),
        ...(release.site.redirects ? { redirects: release.site.redirects } : {}),
      }),
    });
  return files;
}

/** Opens the setup PR that moves the builder's pages into the repository.
 * Merging it turns pages sync on (see `completeMergedPagesSetup`). */
export async function createPagesSetupPullRequest(
  teamId: string,
  input: { directory: string },
  app = new DocsGitHubApp(getDocsGitHubAppConfig()),
) {
  const binding = await db.query.documentationGitBindings.findFirst({
    where: eq(bindings.teamId, teamId),
  });
  if (binding?.status !== "connected")
    throw new GitHubDocsError("SOURCE_REQUIRES_GIT", 409);
  if (binding.pagesDirectory) throw new GitHubDocsError("PAGES_ALREADY_SYNCED", 409);
  if (!binding.capabilities.proposals)
    throw new GitHubDocsError("GITHUB_WRITE_PERMISSION_REQUIRED", 409);
  const directory = normalizePagesDirectory(input.directory);
  const files = await exportPagesFiles(teamId, directory);
  if (!files.length) throw new GitHubDocsError("NOTHING_TO_PROPOSE", 409);

  const access = await readGitBindingAccess(binding, app);
  const { token } = await app.installationToken(
    Number(binding.installationId),
    Number(binding.repositoryId),
    "proposal",
  );
  const owner = access.repository.owner.login;
  const name = access.repository.name;
  const head = await app.branchHead(token, owner, name, binding.branch);
  const entries = await app.commitTree(token, owner, name, head);
  if (entries.some((entry) => entry.path === directory))
    throw new GitHubDocsError("PAGES_DIRECTORY_EXISTS", 409);

  const branch = `frontlit/pages-setup/${randomBytes(6).toString("hex")}`;
  const guard = async () => {
    const fresh = await db.query.documentationGitBindings.findFirst({
      where: eq(bindings.teamId, teamId),
    });
    if (fresh?.generation !== binding.generation || fresh.pagesDirectory)
      throw new GitHubDocsError("GITHUB_SUPERSEDED", 409);
  };
  const pageCount =
    files.length - (files.some((f) => f.path.endsWith("site.json")) ? 1 : 0);
  const commitSha = await app.createPagesBranch(
    token,
    owner,
    name,
    {
      parentSha: head,
      branch,
      message: "Move FrontLit pages into the repository",
      files,
    },
    guard,
  );
  const pr = await app.createPagesPullRequest(
    token,
    owner,
    name,
    {
      branch,
      base: binding.branch,
      title: "Set up FrontLit pages",
      body: `Exports ${pageCount} FrontLit page(s) to \`${directory}/\`, plus \`${siteFilePath(directory)}\` for the header, footer and theme.\n\nOnce merged, FrontLit publishes this folder on every push, and the page builder opens pull requests instead of publishing.`,
    },
    guard,
  );
  await db.insert(pagePullRequests).values({
    teamId,
    kind: "setup",
    branch,
    baseSha: head,
    commitSha,
    number: pr.number,
    url: pr.url,
    directory,
    files: files.map((file) => ({ path: file.path, hash: sha256(file.content) })),
  });
  return pr;
}

/** The latest setup PR, for the connected-repository dialog. */
export async function latestPagesSetup(teamId: string) {
  const row = await db.query.pagePullRequests.findFirst({
    where: and(eq(pagePullRequests.teamId, teamId), eq(pagePullRequests.kind, "setup")),
    orderBy: [desc(pagePullRequests.createdAt)],
  });
  return row
    ? {
        number: row.number,
        url: row.url,
        status: row.status,
        directory: row.directory!,
      }
    : null;
}

export async function hasOpenPagesSetup(teamId: string, executor: any = db) {
  const row = await executor.query.pagePullRequests.findFirst({
    where: and(
      eq(pagePullRequests.teamId, teamId),
      eq(pagePullRequests.kind, "setup"),
      eq(pagePullRequests.status, "open"),
    ),
  });
  return Boolean(row);
}

/**
 * Checks open setup PRs. A merged one turns pages sync on for its folder
 * (the sync that noticed it imports the pages right away); a closed one is
 * marked closed. Returns the binding as it is now.
 */
export async function completeMergedPagesSetup(
  binding: GitBinding,
  app: DocsGitHubApp,
) {
  const open = await db.query.pagePullRequests.findMany({
    where: and(
      eq(pagePullRequests.teamId, binding.teamId),
      eq(pagePullRequests.kind, "setup"),
      eq(pagePullRequests.status, "open"),
    ),
  });
  if (!open.length) return binding;
  const { token } = await app.installationToken(
    Number(binding.installationId),
    Number(binding.repositoryId),
    "review",
  );
  let current = binding;
  for (const row of open) {
    const pr = await app.findPagesPullRequest(
      token,
      binding.ownerLogin,
      binding.repositoryName,
      {
        branch: row.branch,
        base: binding.branch,
        repositoryId: Number(binding.repositoryId),
      },
    );
    if (pr?.state === "open") continue;
    const merged = Boolean(pr?.merged);
    await db
      .update(pagePullRequests)
      .set({ status: merged ? "merged" : "closed", updatedAt: new Date() })
      .where(eq(pagePullRequests.id, row.id));
    if (merged && !current.pagesDirectory) {
      // Builder publishes after the export would be reverted by turning sync
      // on; leave it off and say so, so someone reviews the folder first.
      // Compared as sorted `path:hash` lines: jsonb doesn't keep key order.
      const fingerprint = (files: { path: string; hash: string }[]) =>
        files
          .map((file) => `${file.path}:${file.hash}`)
          .sort()
          .join("\n");
      const exported = await exportPagesFiles(binding.teamId, row.directory!);
      const now = exported.map((file) => ({
        path: file.path,
        hash: sha256(file.content),
      }));
      if (fingerprint(now) !== fingerprint(row.files ?? [])) {
        await db
          .update(bindings)
          .set({
            pagesDiagnostics: [
              {
                code: "PAGES_CHANGED_SINCE_EXPORT",
                severity: "warning",
                blocksSave: false,
                blocksPublish: false,
                message: `Pull request #${row.number} merged, but pages changed in FrontLit since it was opened, so pages sync stayed off. Preview ${row.directory}/ and turn sync on when the repository has the changes you want.`,
              },
            ],
            updatedAt: new Date(),
          })
          .where(eq(bindings.teamId, binding.teamId));
        continue;
      }
      const [updated] = await db
        .update(bindings)
        .set({
          pagesDirectory: row.directory,
          pagesSourceKey: null,
          pagesDiagnostics: null,
          updatedAt: new Date(),
        })
        .where(eq(bindings.teamId, binding.teamId))
        .returning();
      current = updated;
    }
  }
  return current;
}
