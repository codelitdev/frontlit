import { and, eq, gt, inArray } from "drizzle-orm";
import { join } from "node:path";
import { db } from "../db/client";
import {
  teams,
  documents,
  documentationPurges as purges,
  documentationGitFiles as files,
} from "../db/schema";
import { lockSettings } from "./authoring";
import { applyDocumentationPurge } from "./publications";
import {
  deletionLedgerDirectory,
  readDeletionRecord,
  listDeletionRecordFiles,
  retainPurgeDeletionRecord,
  type DeletionRecord,
} from "./deletion-ledger";

function requireMaintenance() {
  if (process.env.DOCS_RESTORE_PENDING !== "true")
    throw new Error(
      "Set DOCS_RESTORE_PENDING=true and stop API/worker processes before deletion-ledger replay.",
    );
}
export async function replayDeletionRecord(record: DeletionRecord) {
  requireMaintenance();
  return db.transaction(async (tx) => {
    if (!(await tx.query.teams.findFirst({ where: eq(teams.id, record.teamId) })))
      return "team_missing";
    await lockSettings(tx, record.teamId);
    const existing = await tx.query.documentationPurges.findFirst({
      where: eq(purges.purgeId, record.purgeId),
    });
    if (
      existing &&
      (existing.teamId !== record.teamId || existing.planHash !== record.planHash)
    )
      throw new Error("Deletion receipt conflicts with the restored database.");
    if (existing?.status === "completed") return "already_applied";
    const aliases = record.sourcePaths.length
      ? await tx.query.documentationGitFiles.findMany({
          where: and(
            eq(files.teamId, record.teamId),
            inArray(
              files.sourcePath,
              record.sourcePaths.map((entry) => entry.path),
            ),
          ),
        })
      : [];
    const documentIds = [
      ...new Set([...record.documentIds, ...aliases.map((entry) => entry.documentId)]),
    ];
    const restored = await tx.query.documents.findMany({
      where: and(
        eq(documents.teamId, record.teamId),
        eq(documents.kind, "doc"),
        inArray(documents.documentId, documentIds),
      ),
    });
    const routes = [
      ...new Set([
        ...record.routes,
        ...restored
          .flatMap((row) => [row.slug, row.draftSlug])
          .filter((route): route is string => Boolean(route)),
      ]),
    ];
    const manifest = {
      documentIds,
      revisionIds: record.revisionIds,
      routes,
      assetIds: [],
      draftVersions: [],
      mediaDeletion: "separate authorized operation",
      retainedExternalCopies: [
        "Git source",
        "already sent customer messages",
        "public media/CDN copies",
        "backups (maximum 30 days)",
      ],
    };
    await applyDocumentationPurge(tx, record.teamId, manifest, record.purgeId);
    for (const entry of record.sourcePaths) {
      await tx
        .insert(files)
        .values({
          teamId: record.teamId,
          sourcePath: entry.path,
          documentId: entry.documentId,
          commitSha: "0".repeat(40),
          blobSha: "0".repeat(40),
          sourceHash: "purged",
          markdown: "",
          frontmatter: {},
          snapshot: {},
          removedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [files.teamId, files.sourcePath],
          set: { markdown: "", frontmatter: {}, snapshot: {}, removedAt: new Date() },
        });
    }
    await tx
      .insert(purges)
      .values({
        purgeId: record.purgeId,
        teamId: record.teamId,
        planHash: record.planHash,
        manifest,
        status: "completed",
        createdAt: new Date(record.planCreatedAt),
        expiresAt: new Date(record.planCreatedAt),
        completedAt: new Date(),
        idempotencyKey: existing?.idempotencyKey ?? `restore:${record.purgeId}`,
      })
      .onConflictDoUpdate({
        target: purges.purgeId,
        set: { manifest, status: "completed", completedAt: new Date() },
      });
    return "applied";
  });
}

export async function replayDeletionLedger(after?: string, limit = 100) {
  requireMaintenance();
  const page = await listDeletionRecordFiles(after, limit);
  // Validate the entire batch before any writes; corrupt records keep the gate on.
  const records = await Promise.all(
    page.files.map(async (name) => {
      const record = await readDeletionRecord(join(deletionLedgerDirectory(), name));
      if (name !== `${record.purgeId}.json`)
        throw new Error("Deletion filename does not match its receipt.");
      return record;
    }),
  );
  const results = { applied: 0, already_applied: 0, team_missing: 0 };
  for (const record of records) results[await replayDeletionRecord(record)]++;
  return { ...results, nextCursor: page.nextCursor, restorePending: true };
}

/** Backfill completed purges created before the independent ledger existed. */
export async function exportDeletionLedger(after?: string, limit = 100) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new Error("Invalid export batch limit.");
  const rows = await db.query.documentationPurges.findMany({
    where: and(
      eq(purges.status, "completed"),
      after ? gt(purges.purgeId, after) : undefined,
    ),
    orderBy: purges.purgeId,
    limit: limit + 1,
  });
  for (const row of rows.slice(0, limit))
    await db.transaction(async (tx) => {
      await lockSettings(tx, row.teamId);
      await retainPurgeDeletionRecord(tx, row);
    });
  return {
    exported: Math.min(rows.length, limit),
    nextCursor: rows.length > limit ? rows[limit - 1].purgeId : null,
  };
}
