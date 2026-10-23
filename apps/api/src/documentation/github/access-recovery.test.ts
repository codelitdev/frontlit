import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { makeTestDb, seedTeam, truncateAll, type TestDb } from "../../test/db";
vi.mock("../../db/client", async () => ({ db: await makeTestDb() }));
import { db as appDb } from "../../db/client";
import {
  documentationGitBindings as bindings,
  documentationGitJobs as jobs,
  documentationSettings as settings,
} from "../../db/schema";
import { GitHubDocsError, type DocsGitHubApp } from "./app";
import { recoverGitAccess } from "./state";
const db = appDb as unknown as TestDb;

function fakeApp(fails = false) {
  return {
    installation: async () => {
      if (fails) throw new GitHubDocsError("GITHUB_ACCESS_LOST", 401);
      return { id: 7, suspended_at: null, permissions: { contents: "write" } };
    },
    installationToken: async () => ({ token: "t" }),
    repositoryById: async () => ({
      id: 9,
      name: "docs",
      private: true,
      owner: { id: 8, login: "org" },
    }),
  } as unknown as DocsGitHubApp;
}

describe("recoverGitAccess", () => {
  beforeEach(() => truncateAll(db));
  async function lost(lastDiagnostic = "GITHUB_ACCESS_LOST") {
    const { team, account } = await seedTeam(db);
    await db.insert(settings).values({ teamId: team.id, source: "git" });
    const [row] = await db
      .insert(bindings)
      .values({
        teamId: team.id,
        installationId: "7",
        repositoryId: "9",
        ownerId: "8",
        ownerLogin: "org",
        repositoryName: "docs",
        repositoryPrivate: true,
        branch: "main",
        directory: "docs",
        status: "access_lost",
        lastDiagnostic,
        grantActorAccountId: account.id,
        grantGithubUserId: "123",
        repositoryAdminVerified: true,
        capabilities: { read: true, proposals: false, directCommit: false },
      })
      .returning();
    return row!;
  }

  it("reconnects and syncs once GitHub answers normally again", async () => {
    const binding = await lost();
    expect(await recoverGitAccess(binding, fakeApp())).toBe(true);
    expect(
      await db.query.documentationGitBindings.findFirst({
        where: eq(bindings.teamId, binding.teamId),
      }),
    ).toMatchObject({ status: "connected", lastDiagnostic: null });
    expect(
      await db.query.documentationGitJobs.findFirst({
        where: eq(jobs.teamId, binding.teamId),
      }),
    ).toMatchObject({ status: "queued" });
  });

  it("stays lost while GitHub still refuses, or when the owner changed", async () => {
    const binding = await lost();
    expect(await recoverGitAccess(binding, fakeApp(true))).toBe(false);
    const after = await db.query.documentationGitBindings.findFirst({
      where: eq(bindings.teamId, binding.teamId),
    });
    expect(after).toMatchObject({ status: "access_lost" });
    expect(after!.nextReconcileAt.getTime()).toBeGreaterThan(Date.now());

    await truncateAll(db);
    const moved = await lost("GITHUB_OWNER_CHANGED");
    expect(await recoverGitAccess(moved, fakeApp())).toBe(false);
  });
});
