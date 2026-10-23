import { randomBytes } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import {
  parsePageFile,
  parseSiteFile,
  serializePageFile,
  serializeSiteFile,
  type PageDocument,
  type SiteDocument,
} from "@frontlit/page-builder/schema";
import { db } from "../db/client";
import {
  documentationGitBindings as bindings,
  gitAssets,
  pagePullRequests,
  pages,
} from "../db/schema";
import {
  DocsGitHubApp,
  getDocsGitHubAppConfig,
  GitHubDocsError,
} from "../documentation/github/app";
import { readGitBindingAccess, type GitBinding } from "../documentation/github/state";
import { getTeamSettings } from "../settings/queries";
import { isRepoPath, mediaRefs, resolveRepoPath, siteFilePath } from "./git-import";
import type { GitTreeEntry } from "../documentation/github/importer";
import { draftDocument, getActiveRelease, pageRevisionFile } from "./releases";

/** Pages are Git-owned while a connected repository syncs a pages folder. */
export async function getPagesGitBinding(teamId: string) {
  const binding = await db.query.documentationGitBindings.findFirst({
    where: eq(bindings.teamId, teamId),
  });
  return binding?.pagesDirectory && binding.status === "connected" ? binding : null;
}

export class PageOwnedByGitError extends Error {
  readonly code = "PAGE_OWNED_BY_GIT";
  constructor() {
    super(
      "This page is managed in GitHub. Create a pull request with your changes, or edit the file in GitHub.",
    );
  }
}

export function pageFilePath(directory: string, slug: string) {
  return `${directory}/${slug || "index"}.json`;
}

/** Where a Git-owned page lives, for the builder's "Edit in GitHub". */
export async function pageGitInfo(page: { id: string; teamId: string; slug: string }) {
  const binding = await getPagesGitBinding(page.teamId);
  if (!binding) return null;
  const path = pageFilePath(binding.pagesDirectory!, page.slug);
  const repo = `https://github.com/${binding.ownerLogin}/${binding.repositoryName}`;
  const pullRequest = await db.query.pagePullRequests.findFirst({
    where: and(
      eq(pagePullRequests.teamId, page.teamId),
      eq(pagePullRequests.pageId, page.id),
    ),
    orderBy: [desc(pagePullRequests.createdAt)],
  });
  return {
    path,
    editUrl: `${repo}/edit/${encodeURIComponent(binding.branch)}/${path}`,
    repositoryUrl: repo,
    branch: binding.branch,
    liveSha: binding.liveSha,
    pullRequest: pullRequest
      ? { number: pullRequest.number, url: pullRequest.url, status: pullRequest.status }
      : null,
  };
}

async function writeAccess(binding: GitBinding, app: DocsGitHubApp) {
  if (!binding.capabilities.proposals)
    throw new GitHubDocsError("GITHUB_WRITE_PERMISSION_REQUIRED", 409);
  const access = await readGitBindingAccess(binding, app);
  const credential = await app.installationToken(
    Number(binding.installationId),
    Number(binding.repositoryId),
    "proposal",
  );
  return { ...access, token: credential.token };
}

/**
 * Opens a pull request with a page's draft (and the draft header/footer
 * when they differ from what's live). Refuses with UPSTREAM_CHANGED when the
 * file changed in GitHub since the live release, so a PR never silently
 * reverts someone else's commit.
 */
export async function createPagePullRequest(
  teamId: string,
  pageId: string,
  app = new DocsGitHubApp(getDocsGitHubAppConfig()),
) {
  const binding = await getPagesGitBinding(teamId);
  if (!binding) throw new GitHubDocsError("SOURCE_REQUIRES_GIT", 409);
  const page = await db.query.pages.findFirst({ where: eq(pages.pageId, pageId) });
  if (!page || page.teamId !== teamId) return null;
  const access = await writeAccess(binding, app);
  const owner = access.repository.owner.login;
  const name = access.repository.name;
  // One open pull request per page: a second one could be merged out of
  // order and overwrite the newer draft. Ask GitHub, so a PR closed or
  // merged there since the last sync doesn't block.
  const openPr = await db.query.pagePullRequests.findFirst({
    where: and(
      eq(pagePullRequests.teamId, teamId),
      eq(pagePullRequests.pageId, page.id),
      eq(pagePullRequests.status, "open"),
    ),
  });
  if (openPr) {
    const pr = await app.findPagesPullRequest(access.token, owner, name, {
      branch: openPr.branch,
      base: binding.branch,
      repositoryId: Number(binding.repositoryId),
    });
    if (pr?.state === "open" && !pr.merged)
      throw new GitHubDocsError("PAGE_PULL_REQUEST_OPEN", 409);
    await db
      .update(pagePullRequests)
      .set({ status: pr?.merged ? "merged" : "closed", updatedAt: new Date() })
      .where(eq(pagePullRequests.id, openPr.id));
  }
  const head = await app.branchHead(access.token, owner, name, binding.branch);
  const entries = await app.commitTree(access.token, owner, name, head);
  const read = async (path: string) => {
    const entry = entries.find((item) => item.path === path && item.type === "blob");
    return entry
      ? new TextDecoder().decode(await app.blob(access.token, owner, name, entry.sha))
      : null;
  };

  const [settings, release] = await Promise.all([
    getTeamSettings(teamId),
    getActiveRelease(teamId),
  ]);
  const files: { path: string; content: string }[] = [];

  const path = pageFilePath(binding.pagesDirectory!, page.slug);
  const live = release?.pages.find((entry) => entry.pageId === page.id);
  const current = await read(path);
  // Imports swap repo image paths for their MediaLit URLs. Map between the
  // two so comparisons match and the PR keeps the repo's paths.
  const assets = await repoAssetUrls(teamId, entries, path, current);
  const swap = (doc: PageDocument, from: Map<string, string>) => {
    const copy = JSON.parse(JSON.stringify(doc)) as PageDocument;
    for (const ref of mediaRefs(copy, "")) {
      const next = from.get(ref.media.url);
      if (next) ref.media.url = next;
    }
    return copy;
  };
  const toRepo = new Map([...assets].map(([repoUrl, url]) => [url, repoUrl]));
  const canonical = (text: string) => {
    try {
      return pageRevisionFile(swap(parsePageFile(text), assets)).text;
    } catch {
      return text;
    }
  };
  if (
    current !== null &&
    live &&
    canonical(current) !== pageRevisionFile(live.revision.content).text
  )
    throw new GitHubDocsError("PAGE_UPSTREAM_CHANGED", 409);
  const draft = draftDocument(page);
  if (current === null || canonical(current) !== pageRevisionFile(draft).text)
    files.push({ path, content: serializePageFile(swap(draft, toRepo)) });

  const header = settings.draftSharedWidgets.header.settings ?? {};
  const footer = settings.draftSharedWidgets.footer.settings ?? {};
  const chromeChanged =
    JSON.stringify(header) !== JSON.stringify(release?.site.header ?? {}) ||
    JSON.stringify(footer) !== JSON.stringify(release?.site.footer ?? {});
  if (chromeChanged) {
    const sitePath = siteFilePath(binding.pagesDirectory!);
    const siteText = await read(sitePath);
    let site: SiteDocument = {};
    if (siteText) {
      try {
        site = parseSiteFile(siteText);
      } catch {
        throw new GitHubDocsError("PAGE_UPSTREAM_CHANGED", 409);
      }
    }
    // Like the page file: never overwrite a header or footer someone changed
    // in GitHub since the live release. Compared in canonical form, since
    // the release snapshot comes back from jsonb with keys reordered.
    const chrome = (doc: SiteDocument) =>
      serializeSiteFile({ header: doc.header, footer: doc.footer });
    if (
      siteText &&
      release &&
      chrome(site) !==
        chrome({ header: release.site.header, footer: release.site.footer })
    )
      throw new GitHubDocsError("PAGE_UPSTREAM_CHANGED", 409);
    files.push({
      path: sitePath,
      content: serializeSiteFile({ ...site, header, footer }),
    });
  }
  if (!files.length) throw new GitHubDocsError("NOTHING_TO_PROPOSE", 409);

  const route = `/${page.slug}`;
  const branch = `frontlit/pages/${page.slug || "index"}-${randomBytes(4).toString("hex")}`;
  const guard = async () => {
    const fresh = await getPagesGitBinding(teamId);
    if (!fresh || fresh.generation !== binding.generation)
      throw new GitHubDocsError("GITHUB_SUPERSEDED", 409);
  };
  const commitSha = await app.createPagesBranch(
    access.token,
    owner,
    name,
    { parentSha: head, branch, message: `Update ${route} from FrontLit`, files },
    guard,
  );
  const pr = await app.createPagesPullRequest(
    access.token,
    owner,
    name,
    {
      branch,
      base: binding.branch,
      title: `Update ${page.name} (${route})`,
      body: `Changes made in the FrontLit page builder.\n\n${files.map((file) => `- \`${file.path}\``).join("\n")}\n\nMerging publishes them on the next sync.`,
    },
    guard,
  );
  await db.insert(pagePullRequests).values({
    teamId,
    kind: "page",
    pageId: page.id,
    branch,
    baseSha: head,
    commitSha,
    number: pr.number,
    url: pr.url,
  });
  return pr;
}

/** Updates the status of FrontLit's open page pull requests. Best effort:
 * a failure here never fails a sync. */
export async function refreshPagePullRequests(binding: GitBinding, app: DocsGitHubApp) {
  const open = await db.query.pagePullRequests.findMany({
    where: and(
      eq(pagePullRequests.teamId, binding.teamId),
      eq(pagePullRequests.status, "open"),
    ),
  });
  if (!open.length) return;
  try {
    const { token } = await app.installationToken(
      Number(binding.installationId),
      Number(binding.repositoryId),
      "review",
    );
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
      const status = !pr
        ? "closed"
        : pr.merged
          ? "merged"
          : pr.state === "open"
            ? "open"
            : "closed";
      if (status !== row.status)
        await db
          .update(pagePullRequests)
          .set({ status, updatedAt: new Date() })
          .where(eq(pagePullRequests.id, row.id));
    }
  } catch {
    // Retried on the next sync.
  }
}

/** Repo-relative image URLs in the current file → the MediaLit URLs the
 * importer uploaded them to (by blob SHA). */
async function repoAssetUrls(
  teamId: string,
  entries: GitTreeEntry[],
  file: string,
  text: string | null,
) {
  const map = new Map<string, string>();
  if (!text) return map;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return map;
  }
  for (const ref of mediaRefs(raw, "")) {
    if (!isRepoPath(ref.media.url)) continue;
    const blob = entries.find(
      (entry) =>
        entry.path === resolveRepoPath(file, ref.media.url) && entry.type === "blob",
    );
    if (!blob) continue;
    const asset = await db.query.gitAssets.findFirst({
      where: and(eq(gitAssets.teamId, teamId), eq(gitAssets.blobSha, blob.sha)),
    });
    if (asset) map.set(ref.media.url, asset.url);
  }
  return map;
}
