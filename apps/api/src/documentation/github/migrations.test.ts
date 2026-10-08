import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeTestDb, seedTeam, type TestDb } from "../../test/db";
vi.mock("../../db/client", async () => ({ db: await makeTestDb() }));
import { db as appDb } from "../../db/client";
import { eq } from "drizzle-orm";
import {
  documents,
  docSections,
  documentationGitFiles as files,
  documentationGitBindings as bindings,
  documentationPublications as publications,
  documentationDeliveryOutbox as outbox,
  documentationGitPreflights as preflights,
  documentationGitSetups as setups,
  documentationGitMigrations as migrations,
  documentationGitMigrationPrs as migrationPrs,
} from "../../db/schema";
import type { AuthzContext } from "../../auth/authorize";
import { saveDocumentation, getDocsSettings } from "../authoring";
import {
  bootstrapDocumentation,
  queuePublication,
  processPublication,
  readDocumentation,
  preflightPurge,
  commitPurge,
} from "../publications";
import { completeGitHubSetup, startGitHubSetup } from "./setup";
import { GitHubDocsError, type GitHubAppConfig } from "./app";
import {
  planGitMigration,
  getGitMigration,
  verifyGitMigration,
  activateGitMigration,
  cancelGitMigration,
} from "./migrations";
import { processGitSync } from "./worker";
const db = appDb as unknown as TestDb;
const sha = "a".repeat(40),
  treeSha = "b".repeat(40);
const config: GitHubAppConfig = {
  appId: "42",
  appSlug: "test",
  clientId: "client",
  clientSecret: "secret",
  privateKey: "unused",
  callbackUrl: "http://localhost:4000/integrations/github/callback",
  webhookSecret: "secret",
  webOrigin: "http://localhost:3000",
};
const repository = {
  id: 9,
  name: "docs",
  full_name: "org/docs",
  private: true,
  default_branch: "trunk",
  owner: { id: 8, login: "org" },
  permissions: { admin: true },
};
describe("reviewed CMS adoption after a platform-created setup PR", () => {
  let teamId: string, actor: AuthzContext, setupId: string;
  let app: any, blobs: Map<string, Buffer>, entries: any[];
  beforeEach(async () => {
    process.env.INTEGRATIONS_ENCRYPTION_KEY = "migration-test-encryption-key";
    const { team, account } = await seedTeam(db);
    teamId = team.id;
    actor = {
      teamId,
      accountId: account.id,
      authKind: "session",
      isOwner: true,
      permissions: [],
      scopes: [],
      audiences: [],
    };
    blobs = new Map();
    entries = [];
    app = {
      exchangeCode: vi.fn().mockResolvedValue("user-token"),
      user: vi.fn().mockResolvedValue({ id: 123, login: "admin" }),
      installations: vi.fn().mockResolvedValue({
        installations: [
          {
            id: 7,
            app_id: 42,
            account: { login: "org", type: "Organization" },
            suspended_at: null,
            permissions: { contents: "read" },
          },
        ],
        total_count: 1,
      }),
      repositories: vi
        .fn()
        .mockResolvedValue({ repositories: [repository], total_count: 1 }),
      repository: vi.fn().mockResolvedValue(repository),
      repositoryById: vi.fn().mockResolvedValue(repository),
      installation: vi.fn().mockResolvedValue({
        id: 7,
        app_id: 42,
        suspended_at: null,
        permissions: { contents: "read" },
      }),
      installationToken: vi.fn().mockResolvedValue({
        token: "repo-read-token",
        expires_at: "2030-01-01T00:00:00Z",
      }),
      branchHead: vi.fn().mockResolvedValue(sha),
      isAncestor: vi.fn().mockResolvedValue(true),
      findMigrationPullRequest: vi.fn().mockResolvedValue({
        number: 2,
        headSha: sha,
        state: "closed",
        merged: true,
        mergeCommitSha: sha,
      }),
      commitTree: vi.fn().mockImplementation(async () => entries),
      blob: vi
        .fn()
        .mockImplementation(
          async (token: string, owner: string, repo: string, id: string) =>
            blobs.get(id),
        ),
    };
    const setup = await startGitHubSetup(teamId, actor, {}, config);
    setupId = setup.setupId;
    await completeGitHubSetup(
      new URL(setup.authorizationUrl).searchParams.get("state")!,
      "code",
      config,
      app,
    );
  });
  async function createPublished() {
    const doc = await saveDocumentation(teamId, null, {
      title: "Guide",
      slug: "api/rotation",
      markdown: "## Rotation\n\nRotate your key in account settings.",
    });
    const s = await bootstrapDocumentation(teamId);
    const pub = await queuePublication(teamId, {
      selected: [
        { documentId: doc.documentId, expectedDraftVersion: doc.draftVersion },
      ],
      removals: [],
      expectedPublicationId: s.activePublicationId,
      expectedDocsDraftVersion: s.draftVersion,
      idempotencyKey: "initial",
    });
    await db
      .update(publications)
      .set({ nextAttemptAt: new Date(0) })
      .where(eq(publications.publicationId, pub.publicationId));
    expect(await processPublication(teamId, pub.publicationId)).toMatchObject({
      status: "active",
    });
    return doc;
  }
  async function plan() {
    const s = await getDocsSettings(teamId);
    const captured = await planGitMigration(
      teamId,
      actor,
      {
        setupId,
        installationId: 7,
        repositoryId: 9,
        branch: "trunk",
        directory: "docs",
        expectedDocsDraftVersion: s.draftVersion,
        expectedPublicationId: s.activePublicationId,
      },
      config,
      app,
    );
    // Seed a previously created PR, since this suite exercises verification/
    // activation; admission and remote writes have their own credential tests.
    await db.insert(migrationPrs).values({
      planId: captured.planId,
      teamId,
      setupId,
      actorCredential: {
        kind: "session",
        accountId: actor.accountId!,
        sessionId: "fixture",
        membershipId: "fixture",
      },
      idempotencyKey: captured.planId,
      inputHash: captured.planHash,
      policyEpoch: s.policyEpoch,
      purgeGeneration: s.purgeGeneration,
      ownerId: "8",
      branch: `frontlit/docs-setup/${captured.planId}`,
      status: "open",
      commitSha: sha,
      pullRequestNumber: 2,
      pullRequestUrl: "https://github.com/org/docs/pull/2",
    });
    return captured;
  }
  function commit(exported: { path: string; markdown: string }[]) {
    const directories = new Set<string>();
    entries = [];
    blobs.clear();
    for (const [i, file] of exported.entries()) {
      const id = (i + 1).toString(16).padStart(40, "0");
      blobs.set(id, Buffer.from(file.markdown));
      const parts = file.path.split("/");
      for (let n = 1; n < parts.length; n++)
        directories.add(parts.slice(0, n).join("/"));
      entries.push({ path: file.path, mode: "100644", type: "blob", sha: id });
    }
    for (const path of directories)
      entries.push({ path, mode: "040000", type: "tree", sha: treeSha });
  }
  const consent = {
    publishSelectedDocsPublicly: true as const,
    automaticallyPublishFuturePushes: true as const,
    delegateToWorkspacePublishers: true as const,
  };
  function activation(p: Awaited<ReturnType<typeof plan>>) {
    return {
      commitSha: sha,
      planHash: p.planHash,
      expectedDocsDraftVersion: p.docsDraftVersion,
      expectedPublicationId: p.activePublicationId,
      idempotencyKey: "adopt-once",
      consent,
    };
  }
  it("requires the matching merged platform PR and publishing-branch ancestry before verification", async () => {
    await createPublished();
    const p = await plan();
    commit(p.files);
    app.findMigrationPullRequest.mockResolvedValueOnce({
      number: 2,
      headSha: sha,
      merged: false,
      mergeCommitSha: null,
    });
    await expect(
      verifyGitMigration(teamId, actor, p.planId, {}, config, app),
    ).rejects.toMatchObject({ code: "GITHUB_SETUP_PR_NOT_MERGED" });
    app.findMigrationPullRequest.mockResolvedValueOnce({
      number: 99,
      headSha: sha,
      merged: true,
      mergeCommitSha: sha,
    });
    await expect(
      verifyGitMigration(teamId, actor, p.planId, {}, config, app),
    ).rejects.toMatchObject({ code: "GITHUB_PROPOSAL_RECOVERY_CONFLICT" });
    app.findMigrationPullRequest.mockResolvedValueOnce({
      number: 2,
      headSha: sha,
      merged: true,
      mergeCommitSha: "e".repeat(40),
    });
    app.isAncestor.mockResolvedValueOnce(false);
    await expect(
      verifyGitMigration(teamId, actor, p.planId, {}, config, app),
    ).rejects.toMatchObject({ code: "MIGRATION_HEAD_CHANGED" });
    await db.delete(migrationPrs).where(eq(migrationPrs.planId, p.planId));
    await expect(
      verifyGitMigration(teamId, actor, p.planId, {}, config, app),
    ).rejects.toMatchObject({ code: "GITHUB_SETUP_PR_REQUIRED" });
    expect((await getDocsSettings(teamId)).source).toBe("editor");
  });
  it("captures only Section metadata for empty editor/empty repository and rejects a missing branch in a nonempty repo", async () => {
    app.branchHead.mockRejectedValueOnce(
      new GitHubDocsError("GITHUB_REFERENCE_UNAVAILABLE", 404),
    );
    app.repositoryIsEmpty = vi.fn().mockResolvedValue(true);
    const p = await plan();
    expect(p.initializeEmptyRepositoryRequired).toBe(true);
    expect(p.files).toHaveLength(1);
    expect(p.files[0].path).toBe("docs/_sections.json");
    expect(p.unpublishedDraftCount).toBe(0);
    const stored = await db.query.documentationGitMigrations.findFirst({
      where: eq(migrations.planId, p.planId),
    });
    expect(
      await db.query.documentationGitPreflights.findFirst({
        where: eq(preflights.preflightId, stored!.preflightId!),
      }),
    ).toMatchObject({ commitSha: null, manifest: null });
    app.branchHead.mockRejectedValueOnce(
      new GitHubDocsError("GITHUB_REFERENCE_UNAVAILABLE", 404),
    );
    app.repositoryIsEmpty.mockResolvedValue(false);
    await expect(plan()).rejects.toMatchObject({
      code: "GITHUB_REFERENCE_UNAVAILABLE",
    });
    expect((await getDocsSettings(teamId)).source).toBe("editor");
  });
  it("exports identities, URLs, a private draft and an empty Section, then adopts equivalently without publishing or embedding", async () => {
    const published = await createPublished();
    const draft = await saveDocumentation(teamId, null, {
      title: "Private draft",
      markdown: "Not ready for visitors.",
    });
    await db
      .insert(docSections)
      .values({ teamId, name: "Empty Section", slug: "empty", order: 10 });
    const before = await readDocumentation(teamId);
    const originalDocs = await db.query.documents.findMany({
      where: eq(documents.teamId, teamId),
    });
    const originalPub = await db.query.documentationPublications.findFirst({
      where: eq(publications.publicationId, before.publicationId!),
    });
    const originalPublicationCount = (
      await db.query.documentationPublications.findMany({
        where: eq(publications.teamId, teamId),
      })
    ).length;
    const p = await plan();
    expect(p.files.find((f) => f.documentId === published.documentId)?.path).toBe(
      `docs/${published.documentId}.md`,
    );
    expect(
      p.files.find((f) => f.documentId === published.documentId)?.markdown,
    ).toContain("slug: api/rotation");
    expect(p.files.find((f) => f.documentId === draft.documentId)?.markdown).toContain(
      "published: false",
    );
    expect(p.files.find((f) => !f.documentId)?.markdown).toContain("Empty Section");
    expect((await getDocsSettings(teamId)).source).toBe("editor");
    commit(p.files);
    expect(
      await verifyGitMigration(teamId, actor, p.planId, {}, config, app),
    ).toMatchObject({ verified: true, commitSha: sha });
    const result = await activateGitMigration(
      teamId,
      actor,
      p.planId,
      activation(p),
      config,
      app,
    );
    expect(result).toMatchObject({
      source: "git",
      status: "connected",
      binding: { liveSha: sha },
    });
    const adoptedDocs = await db.query.documents.findMany({
      where: eq(documents.teamId, teamId),
    });
    expect(adoptedDocs.map(({ draftGitSource, ...doc }) => doc)).toEqual(
      originalDocs.map(({ draftGitSource, ...doc }) => doc),
    );
    for (const doc of adoptedDocs) {
      expect(doc.draftGitSource).toMatchObject({ base: { commitSha: sha } });
      expect(doc.draftGitSource!.sourcePath).toBe(doc.draftGitSource!.base!.sourcePath);
    }
    expect(
      await db.query.documentationPublications.findFirst({
        where: eq(publications.publicationId, before.publicationId!),
      }),
    ).toEqual(originalPub);
    expect((await readDocumentation(teamId)).items).toEqual(before.items);
    expect(
      await db.query.documentationGitFiles.findMany({
        where: eq(files.teamId, teamId),
      }),
    ).toHaveLength(2);
    const sync = await processGitSync(teamId, app);
    expect(sync).toMatchObject({
      status: "active",
      publicationId: before.publicationId,
    });
    expect(
      await db.query.documentationPublications.findMany({
        where: eq(publications.teamId, teamId),
      }),
    ).toHaveLength(originalPublicationCount);
    expect(
      await db.query.documentationDeliveryOutbox.findFirst({
        where: eq(outbox.teamId, teamId),
      }),
    ).toBeDefined();
    await activateGitMigration(teamId, actor, p.planId, activation(p), config, app);
    expect((await getDocsSettings(teamId)).draftVersion).toBe(p.docsDraftVersion + 1);
    await expect(
      activateGitMigration(
        teamId,
        actor,
        p.planId,
        { ...activation(p), commitSha: "c".repeat(40) },
        config,
        app,
      ),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });
  it("refuses export verification and adoption during restore without consuming the reviewed plan", async () => {
    await createPublished();
    const p = await plan();
    commit(p.files);
    expect(
      (await verifyGitMigration(teamId, actor, p.planId, {}, config, app)).verified,
    ).toBe(true);
    app.branchHead.mockClear();
    process.env.DOCS_RESTORE_PENDING = "true";
    try {
      const blocked = {
        diagnostics: [expect.objectContaining({ code: "RESTORE_PENDING" })],
      };
      await expect(plan()).rejects.toMatchObject(blocked);
      await expect(
        verifyGitMigration(teamId, actor, p.planId, {}, config, app),
      ).rejects.toMatchObject(blocked);
      await expect(
        activateGitMigration(teamId, actor, p.planId, activation(p), config, app),
      ).rejects.toMatchObject(blocked);
      expect(app.branchHead).not.toHaveBeenCalled();
      expect((await getDocsSettings(teamId)).source).toBe("editor");
      expect(
        await db.query.documentationGitMigrations.findFirst({
          where: eq(migrations.planId, p.planId),
        }),
      ).toMatchObject({ status: "verified", verifiedSha: sha });
    } finally {
      delete process.env.DOCS_RESTORE_PENDING;
    }
    expect(
      await activateGitMigration(teamId, actor, p.planId, activation(p), config, app),
    ).toMatchObject({ source: "git" });
  });
  it("rejects unpublished live changes and changes made after planning without overwriting anything", async () => {
    const doc = await createPublished();
    const p = await plan();
    await saveDocumentation(teamId, doc.documentId, {
      title: "Local edit",
      expectedDraftVersion: doc.draftVersion,
    });
    await expect(plan()).rejects.toMatchObject({
      code: "MIGRATION_UNPUBLISHED_CHANGES",
    });
    commit(p.files);
    await expect(
      verifyGitMigration(teamId, actor, p.planId, {}, config, app),
    ).rejects.toMatchObject({ code: "MIGRATION_STALE" });
    expect((await getDocsSettings(teamId)).source).toBe("editor");
    expect(
      await db.query.documentationGitBindings.findFirst({
        where: eq(bindings.teamId, teamId),
      }),
    ).toBeUndefined();
  });
  it("reports changed, extra and missing files, accepts formatting differences, and rejects a moved branch head", async () => {
    await createPublished();
    const p = await plan();
    commit(
      p.files.map((f) =>
        f.documentId
          ? {
              ...f,
              markdown: f.markdown.replace("Rotate your key", "Wrong instructions"),
            }
          : f,
      ),
    );
    expect(
      await verifyGitMigration(teamId, actor, p.planId, {}, config, app),
    ).toMatchObject({
      verified: false,
      diagnostics: [expect.objectContaining({ code: "MIGRATION_CONTENT_MISMATCH" })],
    });
    commit(p.files.filter((f) => !f.documentId));
    expect(
      (await verifyGitMigration(teamId, actor, p.planId, {}, config, app)).verified,
    ).toBe(false);
    commit([
      ...p.files,
      { path: "docs/extra.md", markdown: "---\ntitle: Extra\n---\n\nExtra content.\n" },
    ]);
    expect(
      (
        await verifyGitMigration(teamId, actor, p.planId, {}, config, app)
      ).diagnostics.map((d) => d.code),
    ).toContain("MIGRATION_EXTRA_DOCUMENT");
    commit(
      p.files.map((f) => ({ ...f, markdown: f.markdown.replaceAll("\n", "\r\n") })),
    );
    expect(
      (await verifyGitMigration(teamId, actor, p.planId, {}, config, app)).verified,
    ).toBe(true);
    app.branchHead.mockResolvedValue("d".repeat(40));
    await expect(
      activateGitMigration(teamId, actor, p.planId, activation(p), config, app),
    ).rejects.toMatchObject({ code: "MIGRATION_HEAD_CHANGED" });
    expect((await getDocsSettings(teamId)).source).toBe("editor");
  });
  it("clears previous verification after a failed fresh check and permits correction without changing the capture", async () => {
    const p = await plan();
    commit(p.files);
    expect(
      (await verifyGitMigration(teamId, actor, p.planId, {}, config, app)).verified,
    ).toBe(true);
    app.branchHead.mockResolvedValue("c".repeat(40));
    commit(
      p.files.map((file) => ({
        ...file,
        markdown: JSON.stringify({
          version: 1,
          sections: [{ folder: "extra", name: "Extra", order: 0 }],
        }),
      })),
    );
    expect(
      await verifyGitMigration(teamId, actor, p.planId, {}, config, app),
    ).toMatchObject({
      verified: false,
      diagnostics: [expect.objectContaining({ code: "MIGRATION_SECTIONS_MISMATCH" })],
    });
    expect(await getGitMigration(teamId, actor, p.planId)).toMatchObject({
      status: "planned",
      verifiedSha: null,
      planHash: p.planHash,
    });
    await expect(
      activateGitMigration(teamId, actor, p.planId, activation(p), config, app),
    ).rejects.toMatchObject({ code: "MIGRATION_STALE" });
    commit(p.files);
    expect(
      await verifyGitMigration(teamId, actor, p.planId, {}, config, app),
    ).toMatchObject({
      verified: true,
      commitSha: "c".repeat(40),
      planHash: p.planHash,
    });
    expect((await getDocsSettings(teamId)).source).toBe("editor");
    expect(
      await db.query.documentationGitBindings.findFirst({
        where: eq(bindings.teamId, teamId),
      }),
    ).toBeUndefined();
  });
  it("bounds private exports, isolates accounts/teams, and cancellation leaves CMS and remote files intact", async () => {
    await createPublished();
    const p = await plan();
    const first = await getGitMigration(teamId, actor, p.planId, 0, 1);
    expect(first.files).toHaveLength(1);
    expect(first.nextOffset).toBe(1);
    await expect(getGitMigration(teamId, actor, p.planId, 0, 51)).rejects.toMatchObject(
      { code: "INVALID_REQUEST" },
    );
    const foreign = await seedTeam(db);
    await expect(
      getGitMigration(teamId, { ...actor, accountId: foreign.account.id }, p.planId),
    ).rejects.toMatchObject({ code: "GITHUB_USER_AUTH_REQUIRED" });
    const before = await getDocsSettings(teamId);
    await cancelGitMigration(teamId, actor, p.planId);
    expect(await getDocsSettings(teamId)).toEqual(before);
    await expect(
      verifyGitMigration(teamId, actor, p.planId, {}, config, app),
    ).rejects.toMatchObject({ code: "MIGRATION_EXPIRED" });
    expect(app.commitTree).not.toHaveBeenCalled();
  });
  it("sensitive purge erases retained migration/import bodies while preserving the source identity tombstone", async () => {
    const doc = await createPublished();
    const p = await plan();
    commit(p.files);
    await verifyGitMigration(teamId, actor, p.planId, {}, config, app);
    await activateGitMigration(teamId, actor, p.planId, activation(p), config, app);
    const purge = await preflightPurge(teamId, [doc.documentId], actor.accountId!);
    await commitPurge(
      teamId,
      {
        planId: purge.purgeId,
        planHash: purge.planHash,
        acknowledgment: "irreversible-deletion",
        idempotencyKey: "erase-adopted",
      },
      {
        accountId: actor.accountId!,
        authKind: "session",
        isOwner: true,
        sessionAuthenticatedAt: new Date(),
      },
    );
    expect((await getGitMigration(teamId, actor, p.planId)).files).toEqual([]);
    expect(
      await db.query.documentationGitPreflights.findFirst({
        where: eq(preflights.teamId, teamId),
      }),
    ).toBeUndefined();
    expect(
      await db.query.documentationGitFiles.findFirst({
        where: eq(files.teamId, teamId),
      }),
    ).toMatchObject({
      documentId: doc.documentId,
      markdown: "",
      frontmatter: {},
      snapshot: {},
    });
    expect((await readDocumentation(teamId)).items).toHaveLength(0);
  });
  it("allows fresh original-account authorization after token expiry, but rejects noninteractive finalization and an expired plan", async () => {
    await createPublished();
    const p = await plan();
    commit(p.files);
    await db
      .update(setups)
      .set({ expiresAt: new Date(0) })
      .where(eq(setups.setupId, setupId));
    await expect(
      verifyGitMigration(teamId, actor, p.planId, {}, config, app),
    ).rejects.toMatchObject({ code: "GITHUB_SETUP_EXPIRED" });
    const fresh = await startGitHubSetup(teamId, actor, {}, config);
    await completeGitHubSetup(
      new URL(fresh.authorizationUrl).searchParams.get("state")!,
      "code",
      config,
      app,
    );
    expect(
      (
        await verifyGitMigration(
          teamId,
          actor,
          p.planId,
          { setupId: fresh.setupId },
          config,
          app,
        )
      ).verified,
    ).toBe(true);
    expect((await getGitMigration(teamId, actor, p.planId)).setupId).toBe(
      fresh.setupId,
    );
    await expect(
      activateGitMigration(
        teamId,
        {
          ...actor,
          authKind: "oauth",
          scopes: ["documentation:manage", "documentation:publish"],
        },
        p.planId,
        activation(p),
        config,
        app,
      ),
    ).rejects.toMatchObject({ code: "GITHUB_USER_AUTH_REQUIRED" });
    await db
      .update(migrations)
      .set({ expiresAt: new Date(0) })
      .where(eq(migrations.planId, p.planId));
    await expect(
      activateGitMigration(teamId, actor, p.planId, activation(p), config, app),
    ).rejects.toMatchObject({ code: "MIGRATION_EXPIRED" });
    expect((await getDocsSettings(teamId)).source).toBe("editor");
  });
});
