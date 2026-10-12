import { createHash } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { DocsContentError, diagnostic } from "@frontlit/text-editor/docs";
import type { AuthzContext } from "../auth/authorize";
import {
  documentationPublications as publications,
  documentationGitJobs as jobs,
  documentationGitProposals as proposals,
  rateLimitBuckets as buckets,
} from "../db/schema";

export class DocumentationAdmissionError extends DocsContentError {
  constructor(
    code: string,
    message: string,
    public retryAfter: number,
  ) {
    super([diagnostic(code, message)]);
  }
}
export function documentationPrincipal(actor: Partial<AuthzContext> | undefined) {
  if (actor?.apiKeyId) return `key:${actor.apiKeyId}`;
  if (actor?.accountId) return `account:${actor.accountId}`;
  return null;
}
/** Both explicit publication and explicit Git sync share the same team quota. */
export async function requireDocumentationWorkCapacity(tx: any, teamId: string) {
  const cutoff = new Date(Date.now() - 60 * 60_000);
  const editor = await tx.query.documentationPublications.findMany({
    where: and(
      eq(publications.teamId, teamId),
      eq(publications.admissionType, "explicit"),
      gt(publications.createdAt, cutoff),
    ),
    limit: 20,
  });
  const manual = await tx.query.documentationGitJobs.findMany({
    where: and(
      eq(jobs.teamId, teamId),
      eq(jobs.trigger, "manual"),
      gt(jobs.createdAt, cutoff),
    ),
    limit: 20,
  });
  const submitted = await tx.query.documentationGitProposals.findMany({
    where: and(eq(proposals.teamId, teamId), gt(proposals.createdAt, cutoff)),
    limit: 20,
  });
  if (editor.length + manual.length + submitted.length >= 20) {
    const earliest = Math.min(
      ...[...editor, ...manual, ...submitted].map((r) => r.createdAt.getTime()),
    );
    throw new DocumentationAdmissionError(
      "PUBLICATION_RATE_LIMIT",
      "Twenty explicit publication/sync/proposal requests were admitted in the last hour. Retry after the window resets.",
      Math.max(1, Math.ceil((earliest + 60 * 60_000 - Date.now()) / 1000)),
    );
  }
}
/** All callers hold the shared settings lock, including concurrent REST/MCP calls. */
export async function reserveDocumentationValidation(
  tx: any,
  teamId: string,
  principal: string,
) {
  const key = `docs-validation:${teamId}:${createHash("sha256").update(principal).digest("hex")}`;
  const now = new Date();
  const existing = await tx.query.rateLimitBuckets.findFirst({
    where: eq(buckets.key, key),
  });
  const active = existing && existing.resetAt > now;
  if (active && existing.count >= 60)
    throw new DocumentationAdmissionError(
      "VALIDATION_RATE_LIMIT",
      "Sixty documentation validations were requested in this minute. Retry after the window resets.",
      Math.max(1, Math.ceil((existing.resetAt.getTime() - now.getTime()) / 1000)),
    );
  const value = {
    count: active ? existing.count + 1 : 1,
    resetAt: active ? existing.resetAt : new Date(now.getTime() + 60_000),
  };
  await tx
    .insert(buckets)
    .values({ key, ...value })
    .onConflictDoUpdate({ target: buckets.key, set: value });
}
