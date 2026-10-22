import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeTestDb, seedTeam } from "../test/db";

vi.mock("../db/client", async () => ({ db: await makeTestDb() }));

import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import {
  documentationGitBindings,
  pagePullRequests,
  pages as pagesTable,
  teamSettings,
} from "../db/schema";
import type { GitTreeEntry } from "../documentation/github/importer";
import { createPagesRelease, importPagesTree } from "./git-import";
import { activateRelease } from "./releases";
import { createPagePullRequest } from "./git-pr";
import { getTeamSettings } from "../settings/queries";

const home = JSON.stringify({
  title: "Home",
  description: "D",
  layout: [{ name: "hero", settings: { title: "From Git" } }],
});
const site = (headerCta: string) =>
  JSON.stringify({
    header: { ctaLabel: headerCta, links: [] },
    footer: { tagline: "Git footer", columns: [] },
  });

function repo(files: Record<string, string>) {
  const blobs = new Map<string, Uint8Array>();
  const entries: GitTreeEntry[] = [];
  const dirs = new Set<string>();
  for (const [path, text] of Object.entries(files)) {
    const sha = path
      .replace(/[^a-z0-9]/gi, "")
      .padEnd(40, "0")
      .slice(0, 40);
    blobs.set(sha, new TextEncoder().encode(text));
    entries.push({ path, mode: "100644", type: "blob", sha, size: text.length });
    const parts = path.split("/");
    for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join("/"));
  }
  for (const dir of dirs)
    entries.push({ path: dir, mode: "040000", type: "tree", sha: `tree-${dir}` });
  return { entries, readBlob: async (sha: string) => blobs.get(sha)! };
}

describe("createPagePullRequest", () => {
  let teamId: string;
  let pageId: string;

  /** A connected pages repo whose live release came from `files`, and a
   * fake GitHub whose branch now holds `upstream`. */
  async function setup(files: Record<string, string>, upstream = files) {
    teamId = (await seedTeam(db as any)).team.id;
    const live = repo(files);
    const manifest = await importPagesTree({
      teamId,
      commitSha: "a".repeat(40),
      directory: "frontlit/pages",
      entries: live.entries,
      readBlob: live.readBlob,
    });
    await activateRelease(db as any, await createPagesRelease(teamId, manifest));
    await db.insert(documentationGitBindings).values({
      teamId,
      installationId: "1",
      repositoryId: "2",
      ownerId: "3",
      ownerLogin: "acme",
      repositoryName: "site",
      repositoryPrivate: true,
      branch: "main",
      directory: "frontlit/docs",
      docsEnabled: false,
      pagesDirectory: "frontlit/pages",
      status: "connected",
      grantActorAccountId: "account",
      grantGithubUserId: "4",
      repositoryAdminVerified: true,
      capabilities: { read: true, proposals: true, directCommit: false },
    });
    const row = await db.query.pages.findFirst({
      where: and(eq(pagesTable.teamId, teamId), eq(pagesTable.slug, "")),
    });
    pageId = row!.pageId;
    const now = repo(upstream);
    let number = 10;
    return {
      installation: vi.fn(async () => ({
        id: 1,
        suspended_at: null,
        permissions: { contents: "write" },
      })),
      installationToken: vi.fn(async () => ({ token: "t" })),
      repositoryById: vi.fn(async () => ({
        id: 2,
        name: "site",
        private: true,
        owner: { id: 3, login: "acme" },
      })),
      branchHead: vi.fn(async () => "b".repeat(40)),
      commitTree: vi.fn(async () => now.entries),
      blob: vi.fn(async (_t: string, _o: string, _n: string, sha: string) =>
        now.readBlob(sha),
      ),
      createPagesBranch: vi.fn(async () => "c".repeat(40)),
      createPagesPullRequest: vi.fn(async () => {
        number++;
        return { number, url: `https://github.com/acme/site/pull/${number}` };
      }),
      findPagesPullRequest: vi.fn(async () => ({ state: "open", merged: false })),
    };
  }

  /** A builder edit to the draft footer. */
  async function editDraftFooter() {
    const settings = await getTeamSettings(teamId);
    const shared = settings.draftSharedWidgets;
    await db
      .update(teamSettings)
      .set({
        draftSharedWidgets: {
          ...shared,
          footer: {
            ...shared.footer,
            settings: { ...shared.footer.settings, tagline: "Builder footer" },
          },
        } as any,
      })
      .where(eq(teamSettings.teamId, teamId));
  }

  beforeEach(() => vi.clearAllMocks());

  it("refuses to overwrite a header changed in GitHub since the live release", async () => {
    const app = await setup(
      { "frontlit/pages/index.json": home, "frontlit/site.json": site("Start") },
      {
        "frontlit/pages/index.json": home,
        "frontlit/site.json": site("Changed upstream"),
      },
    );
    await editDraftFooter();
    await expect(
      createPagePullRequest(teamId, pageId, app as any),
    ).rejects.toMatchObject({
      code: "PAGE_UPSTREAM_CHANGED",
    });
    expect(app.createPagesBranch).not.toHaveBeenCalled();
  });

  it("sends the draft footer when site.json is unchanged upstream", async () => {
    const app = await setup({
      "frontlit/pages/index.json": home,
      "frontlit/site.json": site("Start"),
    });
    await editDraftFooter();
    await createPagePullRequest(teamId, pageId, app as any);
    const files = (app.createPagesBranch.mock.calls[0] as any[])[3].files;
    expect(files.map((file: { path: string }) => file.path)).toEqual([
      "frontlit/site.json",
    ]);
    const written = JSON.parse(files[0].content);
    expect(written.header.ctaLabel).toBe("Start");
    expect(written.footer.tagline).toBe("Builder footer");
  });

  it("keeps one open pull request per page", async () => {
    const app = await setup({
      "frontlit/pages/index.json": home,
      "frontlit/site.json": site("Start"),
    });
    await editDraftFooter();
    await createPagePullRequest(teamId, pageId, app as any);
    await expect(
      createPagePullRequest(teamId, pageId, app as any),
    ).rejects.toMatchObject({
      code: "PAGE_PULL_REQUEST_OPEN",
    });
    expect(app.createPagesBranch).toHaveBeenCalledTimes(1);

    // Closed in GitHub since the last sync: the next one goes ahead.
    app.findPagesPullRequest.mockResolvedValue({ state: "closed", merged: false });
    const pr = await createPagePullRequest(teamId, pageId, app as any);
    expect(pr?.number).toBe(12);
    const rows = await db.query.pagePullRequests.findMany({
      where: eq(pagePullRequests.teamId, teamId),
    });
    expect(rows.map((row) => row.status).sort()).toEqual(["closed", "open"]);
  });
});
