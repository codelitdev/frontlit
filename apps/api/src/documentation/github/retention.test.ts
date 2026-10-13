import { describe, expect, it, vi } from "vitest";
import { makeTestDb, seedTeam, type TestDb } from "../../test/db";
vi.mock("../../db/client", async () => ({ db: await makeTestDb() }));
import { db as appDb } from "../../db/client";
import { eq } from "drizzle-orm";
import {
  documentationGitMigrations as migrations,
  documentationGitSetups as setups,
  documentationGitPreflights as preflights,
  documentationGitJobs as jobs,
  documentationGitDeliveries as deliveries,
  documentationGitFiles as files,
  rateLimitBuckets as buckets,
  documentationGitProposals as proposals,
} from "../../db/schema";
import { documentationGitChecks as checks } from "../../db/schema";
import { cleanupGitHubDocumentation } from "./retention";
const db = appDb as unknown as TestDb;
describe("bounded Git documentation retention", () => {
  it("retains a terminal sync while its publication check is still reporting", async () => {
    const { team } = await seedTeam(db);
    const now = new Date(),
      old = new Date(now.getTime() - 40 * 24 * 60 * 60_000);
    const [sync] = await db
      .insert(jobs)
      .values({
        teamId: team.id,
        connectionGeneration: 1,
        requestGeneration: 1,
        status: "active",
        observedSha: "a".repeat(40),
        finishedAt: old,
      })
      .returning();
    const [report] = await db
      .insert(checks)
      .values({
        teamId: team.id,
        connectionGeneration: 1,
        syncRunId: sync.runId,
        status: "reporting",
        createdAt: old,
      })
      .returning();
    await cleanupGitHubDocumentation(now);
    expect(
      await db.query.documentationGitJobs.findFirst({
        where: eq(jobs.runId, sync.runId),
      }),
    ).toBeDefined();
    await db
      .update(checks)
      .set({ status: "delivered", finishedAt: old })
      .where(eq(checks.checkId, report.checkId));
    await cleanupGitHubDocumentation(now);
    expect(
      await db.query.documentationGitJobs.findFirst({
        where: eq(jobs.runId, sync.runId),
      }),
    ).toBeUndefined();
    expect(
      await db.query.documentationGitChecks.findFirst({
        where: eq(checks.checkId, report.checkId),
      }),
    ).toBeUndefined();
  });
  it("expires setup credentials/plans, collects old temporary bodies/reports, and retains active identity proofs and source files", async () => {
    const { team, account } = await seedTeam(db);
    const now = new Date(),
      old = new Date(now.getTime() - 40 * 24 * 60 * 60_000);
    const [setup] = await db
      .insert(setups)
      .values({
        teamId: team.id,
        actorAccountId: account.id,
        stateHash: crypto.randomUUID(),
        encryptedUserToken: "encrypted-secret",
        encryptedVerifier: "encrypted-verifier",
        purpose: "connect",
        returnPath: "/content?type=documentation",
        status: "authorized",
        expiresAt: old,
        createdAt: old,
      })
      .returning();
    const [snapshot] = await db
      .insert(preflights)
      .values({
        teamId: team.id,
        setupId: setup.setupId,
        installationId: "7",
        repositoryId: "9",
        ownerId: "8",
        ownerLogin: "org",
        repositoryName: "docs",
        repositoryPrivate: true,
        branch: "trunk",
        directory: "docs",
        commitSha: "a".repeat(40),
        docsDraftVersion: 1,
        manifestHash: "hash",
        manifest: {
          commitSha: "a".repeat(40),
          directory: "docs",
          docs: [],
          sections: [],
          bytes: 0,
        },
        expiresAt: old,
        createdAt: old,
      })
      .returning();
    const base = {
      teamId: team.id,
      setupId: setup.setupId,
      actorAccountId: account.id,
      preflightId: snapshot.preflightId,
      docsDraftVersion: 1,
      activePublicationId: "pub_retained",
      planHash: "hash",
      selection: {
        installationId: 7,
        repositoryId: 9,
        branch: "trunk",
        directory: "docs",
      },
      files: [
        {
          path: "docs/private.md",
          documentId: "doc_identity",
          draftVersion: 1,
          markdown: "private export",
          hash: "hash",
        },
      ],
      sections: [],
      expiresAt: old,
      createdAt: old,
    };
    const [adopted] = await db
      .insert(migrations)
      .values({
        ...base,
        status: "activated",
        verifiedSha: "a".repeat(40),
        activatedAt: old,
      })
      .returning();
    const [expired] = await db
      .insert(migrations)
      .values({ ...base, status: "planned" })
      .returning();
    await db.insert(files).values({
      teamId: team.id,
      sourcePath: "docs/current.md",
      documentId: "doc_identity",
      commitSha: "a".repeat(40),
      blobSha: "b".repeat(40),
      sourceHash: "hash",
      markdown: "active source",
      frontmatter: { title: "Active" },
      snapshot: { draftHash: "hash" },
    });
    await db.insert(jobs).values({
      teamId: team.id,
      connectionGeneration: 1,
      requestGeneration: 1,
      status: "failed",
      finishedAt: old,
      createdAt: old,
    });
    const [active] = await db
      .insert(jobs)
      .values({
        teamId: team.id,
        connectionGeneration: 1,
        requestGeneration: 2,
        status: "running",
        createdAt: old,
      })
      .returning();
    await db
      .insert(deliveries)
      .values({ deliveryId: crypto.randomUUID(), event: "push", receivedAt: old });
    await db.insert(buckets).values([
      { key: `docs-validation:${team.id}:expired`, count: 60, resetAt: old },
      { key: `docs-validation:${team.id}:current`, count: 1, resetAt: now },
      { key: `inbox:${team.id}:expired`, count: 1, resetAt: old },
    ]);
    const proposal = {
      teamId: team.id,
      inputHash: "hash",
      actorCredential: { kind: "apikey" as const, keyId: "minimal-reference" },
      connectionGeneration: 1,
      grantVersion: 1,
      mode: "pull_request" as const,
      title: "Reviewed change",
      changes: [
        {
          documentId: "doc_identity",
          draftVersion: 1,
          base: null,
          target: {
            sourcePath: "docs/current.md",
            markdown: "retained private proposal",
          },
        },
      ],
      createdAt: old,
    };
    await db.insert(proposals).values({
      ...proposal,
      idempotencyKey: "closed",
      status: "closed",
      finishedAt: old,
    });
    const [openProposal] = await db
      .insert(proposals)
      .values({ ...proposal, idempotencyKey: "open", status: "open" })
      .returning();
    expect(await cleanupGitHubDocumentation(now)).toEqual({
      credentials: 1,
      plansExpired: 1,
      exportsRemoved: 2,
      snapshotsRemoved: 1,
      reportsRemoved: 1,
      checkReportsRemoved: 0,
      receiptsRemoved: 1,
      validationBucketsRemoved: 1,
      proposalsRemoved: 1,
    });
    expect(
      await db.query.documentationGitSetups.findFirst({
        where: eq(setups.setupId, setup.setupId),
      }),
    ).toMatchObject({
      status: "expired",
      encryptedUserToken: null,
      encryptedVerifier: null,
    });
    expect(
      await db.query.documentationGitMigrations.findFirst({
        where: eq(migrations.planId, adopted.planId),
      }),
    ).toMatchObject({
      status: "activated",
      verifiedSha: "a".repeat(40),
      activePublicationId: "pub_retained",
      files: [],
      preflightId: null,
    });
    expect(
      await db.query.documentationGitMigrations.findFirst({
        where: eq(migrations.planId, expired.planId),
      }),
    ).toMatchObject({ status: "expired", files: [] });
    expect(
      await db.query.documentationGitFiles.findFirst({
        where: eq(files.teamId, team.id),
      }),
    ).toMatchObject({ markdown: "active source", documentId: "doc_identity" });
    expect(
      await db.query.documentationGitJobs.findFirst({
        where: eq(jobs.runId, active.runId),
      }),
    ).toMatchObject({ status: "running" });
    expect((await cleanupGitHubDocumentation(now)).exportsRemoved).toBe(0);
    expect(
      await db.query.documentationGitProposals.findFirst({
        where: eq(proposals.proposalId, openProposal.proposalId),
      }),
    ).toMatchObject({ status: "open", changes: proposal.changes });
    expect(
      await db.query.rateLimitBuckets.findFirst({
        where: eq(buckets.key, `inbox:${team.id}:expired`),
      }),
    ).toBeDefined();
    expect(
      await db.query.rateLimitBuckets.findFirst({
        where: eq(buckets.key, `docs-validation:${team.id}:current`),
      }),
    ).toBeDefined();
  });
  it("collects only expired terminal check reports while retaining pending reporting work", async () => {
    const { team } = await seedTeam(db);
    const now = new Date(),
      old = new Date(now.getTime() - 31 * 24 * 60 * 60_000);
    const rows = await db
      .insert(checks)
      .values([
        {
          teamId: team.id,
          connectionGeneration: 1,
          pullRequestNumber: 1,
          status: "delivered" as const,
          createdAt: old,
          finishedAt: old,
        },
        {
          teamId: team.id,
          connectionGeneration: 1,
          pullRequestNumber: 2,
          status: "superseded" as const,
          createdAt: old,
          finishedAt: old,
        },
        {
          teamId: team.id,
          connectionGeneration: 1,
          pullRequestNumber: 3,
          status: "reporting" as const,
          createdAt: old,
          finishedAt: old,
        },
        {
          teamId: team.id,
          connectionGeneration: 1,
          pullRequestNumber: 4,
          status: "delivered" as const,
          finishedAt: now,
        },
      ])
      .returning();
    expect((await cleanupGitHubDocumentation(now)).checkReportsRemoved).toBe(2);
    const retained = await db.query.documentationGitChecks.findMany({
      where: eq(checks.teamId, team.id),
    });
    expect(retained.map((row) => row.checkId).sort()).toEqual(
      rows
        .slice(2)
        .map((row) => row.checkId)
        .sort(),
    );
  });
});
