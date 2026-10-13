import { constants } from "node:fs";
import { mkdir, open, link, unlink, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { DocsContentError, diagnostic } from "@frontlit/text-editor/docs";
import {
  documentationGitFiles,
  documentationGitProposalDocuments,
  documents,
} from "../db/schema";

const id = z.string().min(1).max(256);
const aliases = z.array(z.string().min(1).max(2048)).max(10000);
export const deletionRecordSchema = z
  .object({
    version: z.literal(1),
    purgeId: z.string().regex(/^purge_[a-z0-9]+$/),
    teamId: id,
    planHash: z.string().regex(/^[a-f0-9]{64}$/),
    planCreatedAt: z.string().datetime(),
    documentIds: z.array(id).min(1).max(1000),
    revisionIds: z.array(id).max(10000),
    routes: aliases,
    sourcePaths: z
      .array(z.object({ documentId: id, path: z.string().min(1).max(2048) }).strict())
      .max(10000),
  })
  .strict();
export type DeletionRecord = z.infer<typeof deletionRecordSchema>;
const MAX_BYTES = 2 * 1024 * 1024;

function unavailable(): never {
  throw new DocsContentError([
    diagnostic(
      "PURGE_LEDGER_UNAVAILABLE",
      "Configure writable, durable documentation deletion-ledger storage outside database backups before purging.",
    ),
  ]);
}
export function deletionLedgerDirectory() {
  const path = process.env.DOCS_DELETION_LEDGER_DIR;
  if (!path) unavailable();
  return resolve(path);
}
export const deletionRecordHash = (record: DeletionRecord) =>
  createHash("sha256")
    .update(JSON.stringify(deletionRecordSchema.parse(record)))
    .digest("hex");

export async function readDeletionRecord(file: string): Promise<DeletionRecord> {
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    if ((await handle.stat()).size > MAX_BYTES)
      throw new Error("Deletion record exceeds the supported size.");
    return deletionRecordSchema.parse(JSON.parse(await handle.readFile("utf8")));
  } finally {
    await handle.close();
  }
}

/** An immutable authorized deletion intent survives a database rollback/crash.
 * Replay conservatively honors that intent, even if its commit acknowledgment
 * was lost. Never infer successful universal recall from this local record. */
export async function writeDeletionRecord(input: DeletionRecord) {
  const record = deletionRecordSchema.parse(input);
  const data = JSON.stringify(record);
  if (Buffer.byteLength(data) > MAX_BYTES) unavailable();
  const root = deletionLedgerDirectory();
  const target = join(root, `${record.purgeId}.json`);
  const temporary = join(root, `.${record.purgeId}.${randomUUID()}.tmp`);
  try {
    await mkdir(root, { recursive: true, mode: 0o700 });
    const handle = await open(temporary, "wx", 0o600);
    try {
      await handle.writeFile(data);
      await handle.sync();
    } finally {
      await handle.close();
    }
    try {
      await link(temporary, target);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if (
        deletionRecordHash(await readDeletionRecord(target)) !==
        deletionRecordHash(record)
      )
        throw new Error("Deletion receipt conflict.");
    }
    await unlink(temporary);
    const directory = await open(root, constants.O_RDONLY);
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
    return record;
  } catch {
    unavailable();
  } finally {
    await unlink(temporary).catch(() => {});
  }
}

export async function retainPurgeDeletionRecord(tx: any, plan: any) {
  const ids: string[] = [...plan.manifest.documentIds].sort();
  try {
    const retained = await readDeletionRecord(
      join(deletionLedgerDirectory(), `${plan.purgeId}.json`),
    );
    if (
      retained.planHash !== plan.planHash ||
      retained.teamId !== plan.teamId ||
      JSON.stringify(retained.documentIds) !== JSON.stringify(ids)
    )
      unavailable();
    return retained;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") unavailable();
  }

  const rows = await tx.query.documents.findMany({
    where: and(
      eq(documents.teamId, plan.teamId),
      eq(documents.kind, "doc"),
      inArray(documents.documentId, ids),
    ),
  });
  const files = await tx.query.documentationGitFiles.findMany({
    where: and(
      eq(documentationGitFiles.teamId, plan.teamId),
      inArray(documentationGitFiles.documentId, ids),
    ),
  });
  const proposals = await tx.query.documentationGitProposalDocuments.findMany({
    where: and(
      eq(documentationGitProposalDocuments.teamId, plan.teamId),
      inArray(documentationGitProposalDocuments.documentId, ids),
    ),
  });
  const paths = new Map<string, { documentId: string; path: string }>();
  const add = (documentId: string, path: string | undefined | null) => {
    if (path) paths.set(path, { documentId, path });
  };
  for (const row of files) add(row.documentId, row.sourcePath);
  for (const row of rows) {
    add(row.documentId, row.draftGitSource?.sourcePath);
    add(row.documentId, row.draftGitSource?.base?.sourcePath);
  }
  for (const row of proposals) {
    add(row.documentId, row.sourcePath);
    add(row.documentId, row.targetPath);
  }
  return writeDeletionRecord({
    version: 1,
    purgeId: plan.purgeId,
    teamId: plan.teamId,
    planHash: plan.planHash,
    planCreatedAt: plan.createdAt.toISOString(),
    documentIds: ids,
    revisionIds: [...plan.manifest.revisionIds].sort(),
    routes: [...plan.manifest.routes].sort(),
    sourcePaths: [...paths.values()].sort((a, b) => a.path.localeCompare(b.path)),
  });
}

export async function listDeletionRecordFiles(after?: string, limit = 100) {
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100 ||
    (after && !/^purge_[a-z0-9]+\.json$/.test(after))
  )
    throw new Error("Invalid deletion-ledger cursor or batch limit.");
  const files = (await readdir(deletionLedgerDirectory()))
    .filter((name) => /^purge_[a-z0-9]+\.json$/.test(name))
    .sort()
    .filter((name) => !after || name > after);
  return {
    files: files.slice(0, limit),
    nextCursor: files.length > limit ? files[limit - 1] : null,
  };
}
