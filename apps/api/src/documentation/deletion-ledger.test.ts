import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { makeTestDb, seedTeam, type TestDb } from "../test/db";
const state = vi.hoisted(() => ({ db: null as TestDb | null }));
vi.mock("../db/client", async () => {
  state.db = await makeTestDb();
  return {
    get db() {
      return state.db!;
    },
  };
});
import { db as appDb } from "../db/client";
import {
  documents,
  documentationGitFiles as files,
  documentationRevisions as revisions,
  documentationPurges as purges,
} from "../db/schema";
import { saveDocumentation, getDocsSettings } from "./authoring";
import {
  queuePublication,
  processPublication,
  preflightPurge,
  commitPurge,
  readDocumentation,
} from "./publications";
import {
  readDeletionRecord,
  writeDeletionRecord,
  listDeletionRecordFiles,
  retainPurgeDeletionRecord,
} from "./deletion-ledger";
import { replayDeletionLedger, exportDeletionLedger } from "./deletion-replay";

const baseDirectory = process.env.DOCS_DELETION_LEDGER_DIR!;
const SECRET = "PRIVATE BODY MUST NOT ENTER THE DELETION LEDGER";
describe("independent deletion ledger and old-backup replay", () => {
  beforeEach(async () => {
    await state.db?.$client.close();
    state.db = await makeTestDb();
    process.env.DOCS_DELETION_LEDGER_DIR = await mkdtemp(join(baseDirectory, "case-"));
  });
  afterEach(() => {
    delete process.env.DOCS_RESTORE_PENDING;
    process.env.DOCS_DELETION_LEDGER_DIR = baseDirectory;
  });
  async function fixture() {
    const { team, account } = await seedTeam(appDb as unknown as TestDb);
    const doc = (await saveDocumentation(team.id, null, {
      title: "Private title",
      slug: "private-guide",
      markdown: SECRET,
    }))!;
    const settings = await getDocsSettings(team.id);
    const publication = await queuePublication(team.id, {
      selected: [{ documentId: doc.documentId, expectedDraftVersion: 1 }],
      removals: [],
      expectedDocsDraftVersion: settings.draftVersion,
      expectedPublicationId: null,
      idempotencyKey: "publish",
    });
    expect(await processPublication(team.id, publication.publicationId)).toMatchObject({
      status: "active",
    });
    await appDb.insert(files).values({
      teamId: team.id,
      documentId: doc.documentId,
      sourcePath: "docs/private-guide.md",
      commitSha: "a".repeat(40),
      blobSha: "b".repeat(40),
      sourceHash: "hash",
      markdown: SECRET,
      frontmatter: { title: "Private title" },
      snapshot: doc,
    });
    const plan = await preflightPurge(team.id, [doc.documentId], account.id);
    const input = {
      planId: plan.purgeId,
      planHash: plan.planHash,
      acknowledgment: "irreversible-deletion" as const,
      idempotencyKey: "purge",
    };
    const actor = {
      accountId: account.id,
      isOwner: true,
      authKind: "session",
      sessionAuthenticatedAt: new Date(),
    };
    return {
      teamId: team.id,
      doc,
      plan,
      commit: () => commitPurge(team.id, input, actor),
    };
  }
  it("retains a minimal immutable intent before deletion and replays the original receipt idempotently", async () => {
    const f = await fixture();
    await f.commit();
    const page = await listDeletionRecordFiles();
    expect(page.files).toEqual([`${f.plan.purgeId}.json`]);
    const file = join(process.env.DOCS_DELETION_LEDGER_DIR!, page.files[0]);
    const record = await readDeletionRecord(file);
    expect(record).toMatchObject({
      documentIds: [f.doc.documentId],
      sourcePaths: [{ path: "docs/private-guide.md", documentId: f.doc.documentId }],
    });
    expect(await readFile(file, "utf8")).not.toContain(SECRET);
    expect(await readFile(file, "utf8")).not.toContain("Private title");
    await f.commit();
    await expect(
      writeDeletionRecord({ ...record, routes: ["different-route"] }),
    ).rejects.toMatchObject({
      diagnostics: [expect.objectContaining({ code: "PURGE_LEDGER_UNAVAILABLE" })],
    });
    expect(await readDeletionRecord(file)).toEqual(record);
  });
  it("fails closed when independent ledger storage is missing, leaving bodies and publication intact", async () => {
    const f = await fixture();
    delete process.env.DOCS_DELETION_LEDGER_DIR;
    await expect(f.commit()).rejects.toMatchObject({
      diagnostics: [expect.objectContaining({ code: "PURGE_LEDGER_UNAVAILABLE" })],
    });
    expect(
      await appDb.query.documents.findFirst({
        where: eq(documents.documentId, f.doc.documentId),
      }),
    ).toBeTruthy();
    expect((await readDocumentation(f.teamId)).items).toHaveLength(1);
    expect(
      await appDb.query.documentationPurges.findFirst({
        where: eq(purges.purgeId, f.plan.purgeId),
      }),
    ).toMatchObject({ status: "preflight" });
  });
  it("restores an actual pre-purge database dump, replays independent records, and prevents serving or recreating deleted content", async () => {
    const f = await fixture();
    const backup = await state.db!.$client.dumpDataDir();
    await f.commit();
    await state.db!.$client.close();
    state.db = await makeTestDb(backup);
    expect(
      await appDb.query.documents.findFirst({
        where: eq(documents.documentId, f.doc.documentId),
      }),
    ).toBeTruthy();
    expect(
      await appDb.query.documentationPurges.findFirst({
        where: eq(purges.purgeId, f.plan.purgeId),
      }),
    ).toMatchObject({ status: "preflight" });
    await expect(replayDeletionLedger()).rejects.toThrow("DOCS_RESTORE_PENDING");
    process.env.DOCS_RESTORE_PENDING = "true";
    await expect(readDocumentation(f.teamId)).rejects.toThrow();
    expect(await replayDeletionLedger()).toMatchObject({
      applied: 1,
      nextCursor: null,
      restorePending: true,
    });
    expect(
      await appDb.query.documents.findFirst({
        where: eq(documents.documentId, f.doc.documentId),
      }),
    ).toBeUndefined();
    expect(
      await appDb.query.documentationRevisions.findMany({
        where: eq(revisions.documentId, f.doc.documentId),
      }),
    ).toHaveLength(0);
    expect(
      await appDb.query.documentationGitFiles.findFirst({
        where: eq(files.teamId, f.teamId),
      }),
    ).toMatchObject({
      markdown: "",
      snapshot: {},
      frontmatter: {},
      removedAt: expect.any(Date),
    });
    const epoch = (await getDocsSettings(f.teamId)).policyEpoch;
    expect(await replayDeletionLedger()).toMatchObject({
      applied: 0,
      already_applied: 1,
    });
    expect((await getDocsSettings(f.teamId)).policyEpoch).toBe(epoch);
    delete process.env.DOCS_RESTORE_PENDING;
    expect((await readDocumentation(f.teamId)).items).toHaveLength(0);
    const copy = (await saveDocumentation(f.teamId, null, {
      title: "Attempted resurrection",
      slug: "private-guide",
      markdown: SECRET,
    }))!;
    const settings = await getDocsSettings(f.teamId);
    await expect(
      queuePublication(f.teamId, {
        selected: [{ documentId: copy.documentId, expectedDraftVersion: 1 }],
        removals: [],
        expectedPublicationId: settings.activePublicationId,
        expectedDocsDraftVersion: settings.draftVersion,
        idempotencyKey: "recreate",
      }),
    ).rejects.toThrow();
  }, 60000);
  it("rejects corrupt batches before deleting anything and never clears restore-pending", async () => {
    const f = await fixture();
    await writeFile(
      join(process.env.DOCS_DELETION_LEDGER_DIR!, "purge_invalid.json"),
      JSON.stringify({ version: 1, content: SECRET }),
    );
    process.env.DOCS_RESTORE_PENDING = "true";
    await expect(replayDeletionLedger()).rejects.toThrow();
    expect(process.env.DOCS_RESTORE_PENDING).toBe("true");
    expect(
      await appDb.query.documents.findFirst({
        where: eq(documents.documentId, f.doc.documentId),
      }),
    ).toBeTruthy();
  });
  it("retains authorized deletion intent across rollback and restores source tombstones absent from an older backup", async () => {
    const f = await fixture();
    // The database transaction has already authorized the owner's reviewed
    // intent. A failure after independent retention must not lose that intent.
    await expect(
      appDb.transaction(async (tx) => {
        const plan = await tx.query.documentationPurges.findFirst({
          where: eq(purges.purgeId, f.plan.purgeId),
        });
        await retainPurgeDeletionRecord(tx, plan);
        await tx.delete(documents).where(eq(documents.documentId, f.doc.documentId));
        throw new Error("Simulated transaction failure after ledger retention");
      }),
    ).rejects.toThrow("Simulated transaction failure");
    expect(
      await appDb.query.documents.findFirst({
        where: eq(documents.documentId, f.doc.documentId),
      }),
    ).toBeTruthy();
    expect((await listDeletionRecordFiles()).files).toHaveLength(1);
    // An older backup can predate the Git mapping entirely. The independently
    // retained path must still become a purge tombstone during replay.
    await appDb.delete(files).where(eq(files.teamId, f.teamId));
    process.env.DOCS_RESTORE_PENDING = "true";
    expect(await replayDeletionLedger()).toMatchObject({ applied: 1 });
    expect(
      await appDb.query.documents.findFirst({
        where: eq(documents.documentId, f.doc.documentId),
      }),
    ).toBeUndefined();
    expect(
      await appDb.query.documentationGitFiles.findFirst({
        where: eq(files.teamId, f.teamId),
      }),
    ).toMatchObject({
      sourcePath: "docs/private-guide.md",
      documentId: f.doc.documentId,
      markdown: "",
      removedAt: expect.any(Date),
    });
    expect(process.env.DOCS_RESTORE_PENDING).toBe("true");
  });
  it("backfills pre-ledger completed receipts in bounded batches", async () => {
    const f = await fixture();
    await f.commit();
    process.env.DOCS_DELETION_LEDGER_DIR = await mkdtemp(
      join(baseDirectory, "backfill-"),
    );
    expect(await exportDeletionLedger(undefined, 1)).toMatchObject({
      exported: 1,
      nextCursor: null,
    });
    expect((await listDeletionRecordFiles()).files).toEqual([`${f.plan.purgeId}.json`]);
  });
});
