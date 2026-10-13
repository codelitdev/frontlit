import { and, desc, eq, sql } from "drizzle-orm";
import { documentationGitCheckListQuerySchema } from "@frontlit/api-contract";
import { db } from "../../db/client";
import { documentationGitChecks as checks } from "../../db/schema";
import { lockSettings } from "../authoring";
import { GitHubDocsError } from "./app";
import { serializeDates } from "../../utils/public";
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
async function projection(
  tx: Transaction,
  row: typeof checks.$inferSelect,
  includeDiagnostics = true,
) {
  const settings = await lockSettings(tx, row.teamId);
  const result = row.result;
  const publicationResult = row.publicationResult;
  const redacted = Boolean(
    (publicationResult &&
      (publicationResult.policyEpoch !== settings.policyEpoch ||
        publicationResult.purgeGeneration !== settings.purgeGeneration)) ||
      (result &&
        (result.policyEpoch !== settings.policyEpoch ||
          result.purgeGeneration !== settings.purgeGeneration)),
  );
  return serializeDates({
    checkId: row.checkId,
    kind: row.syncRunId ? "publication" : "validation",
    syncRunId: row.syncRunId,
    publicationResult: publicationResult
      ? {
          commitSha: publicationResult.commitSha,
          publicationId: publicationResult.publicationId,
          outcome: publicationResult.outcome,
          publishedCount: publicationResult.publishedCount,
          diagnostics:
            redacted || !includeDiagnostics ? [] : publicationResult.diagnostics,
          redacted,
        }
      : null,
    pullRequestNumber: row.pullRequestNumber,
    status: row.status,
    checkRunId: row.checkRunId,
    lastError: row.lastError,
    errorPhase: row.errorPhase,
    createdAt: row.createdAt,
    finishedAt: row.finishedAt,
    result: result
      ? {
          headSha: result.headSha,
          baseSha: result.baseSha,
          mergeSha: result.mergeSha,
          outcome: result.outcome,
          fileCount: result.fileCount,
          publishedCount: result.publishedCount,
          diagnostics: redacted || !includeDiagnostics ? [] : result.diagnostics,
          redacted,
        }
      : null,
  });
}
export async function getGitCheck(teamId: string, checkId: string) {
  return db.transaction(async (tx) => {
    await lockSettings(tx, teamId);
    const row = await tx.query.documentationGitChecks.findFirst({
      where: and(eq(checks.teamId, teamId), eq(checks.checkId, checkId)),
    });
    if (!row) throw new GitHubDocsError("GITHUB_CHECK_NOT_FOUND", 404);
    return projection(tx, row);
  });
}
export async function listGitChecks(teamId: string, raw: unknown = {}) {
  const parsed = documentationGitCheckListQuerySchema.safeParse(raw);
  if (!parsed.success) throw new GitHubDocsError("INVALID_REQUEST", 400);
  const { cursor, limit } = parsed.data;
  return db.transaction(async (tx) => {
    await lockSettings(tx, teamId);
    if (
      cursor &&
      !(await tx.query.documentationGitChecks.findFirst({
        where: and(eq(checks.teamId, teamId), eq(checks.checkId, cursor)),
      }))
    )
      throw new GitHubDocsError("INVALID_CURSOR", 400);
    const rows = await tx.query.documentationGitChecks.findMany({
      where: and(
        eq(checks.teamId, teamId),
        cursor
          ? sql`(${checks.createdAt}, ${checks.checkId}) < (select created_at, check_id from documentation_git_checks where team_id = ${teamId} and check_id = ${cursor})`
          : undefined,
      ),
      orderBy: [desc(checks.createdAt), desc(checks.checkId)],
      limit: limit + 1,
    });
    const items = [];
    for (const row of rows.slice(0, limit))
      items.push(await projection(tx, row, false));
    return { items, nextCursor: rows.length > limit ? items.at(-1)!.checkId : null };
  });
}
