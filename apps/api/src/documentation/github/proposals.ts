import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  documentationGitProposalBodySchema,
  documentationGitProposalListQuerySchema,
} from "@frontlit/api-contract";
import {
  DocsContentError,
  diagnostic,
  serializeDocsMarkdown,
  requireDocsFrontmatter,
} from "@frontlit/text-editor/docs";
import { db } from "../../db/client";
import {
  documents,
  documentationGitBindings as bindings,
  documentationGitProposals as proposals,
  documentationGitProposalDocuments as proposalDocs,
} from "../../db/schema";
import { serializeDates } from "../../utils/public";
import { DraftConflict, lockSettings } from "../authoring";
import { requireDocumentationWorkCapacity } from "../admission";
import { digest, documentationReadAllowed } from "../publications";
import { GitHubDocsError } from "./app";
import { assertGitPublisherCredential, type GitPublisherCredential } from "./publisher";
import { gitDraftSource } from "./drafts";
import type { CapturedGitChange } from "./proposal-patch";
function fail(code: string): never {
  throw new GitHubDocsError(code, 409);
}
/** Private status only. Never return captured Markdown or credential references;
 * access checks also hide proposal titles/diagnostics that may copy private text. */
export async function getGitProposal(teamId: string, proposalId: string) {
  const row = await db.query.documentationGitProposals.findFirst({
    where: and(eq(proposals.teamId, teamId), eq(proposals.proposalId, proposalId)),
  });
  if (!row) throw new GitHubDocsError("GITHUB_PROPOSAL_NOT_FOUND", 404);
  const links = await db.query.documentationGitProposalDocuments.findMany({
    where: and(
      eq(proposalDocs.teamId, teamId),
      eq(proposalDocs.proposalId, proposalId),
    ),
  });
  let restricted = false;
  for (const link of links) {
    const doc = await db.query.documents.findFirst({
      where: and(
        eq(documents.teamId, teamId),
        eq(documents.documentId, link.documentId),
        eq(documents.kind, "doc"),
      ),
    });
    if (!doc || !(await documentationReadAllowed(teamId, doc, false)))
      restricted = true;
  }
  return {
    ...proposalProjection(row),
    ...(restricted
      ? { title: "Restricted documentation proposal", diagnostics: [] }
      : {}),
    captured: links.map((link) => ({
      documentId: link.documentId,
      draftVersion: link.draftVersion,
      sourcePath: link.sourcePath,
      targetPath: link.targetPath,
    })),
  };
}

export async function listGitProposals(teamId: string, raw: unknown = {}) {
  const parsed = documentationGitProposalListQuerySchema.safeParse(raw);
  if (!parsed.success) throw new GitHubDocsError("INVALID_REQUEST", 400);
  const { cursor, limit } = parsed.data;
  if (
    cursor &&
    !(await db.query.documentationGitProposals.findFirst({
      where: and(eq(proposals.teamId, teamId), eq(proposals.proposalId, cursor)),
    }))
  )
    throw new GitHubDocsError("INVALID_CURSOR", 400);
  const rows = await db.query.documentationGitProposals.findMany({
    where: and(
      eq(proposals.teamId, teamId),
      cursor
        ? sql`(${proposals.createdAt}, ${proposals.proposalId}) < (select created_at, proposal_id from documentation_git_proposals where team_id = ${teamId} and proposal_id = ${cursor})`
        : undefined,
    ),
    orderBy: [desc(proposals.createdAt), desc(proposals.proposalId)],
    limit: limit + 1,
  });
  const items = [];
  for (const row of rows.slice(0, limit))
    items.push(await getGitProposal(teamId, row.proposalId));
  return { items, nextCursor: rows.length > limit ? rows[limit - 1].proposalId : null };
}

export function proposalProjection(row: typeof proposals.$inferSelect) {
  const {
    proposalId,
    mode,
    title,
    status,
    baseSha,
    commitSha,
    mergedCommitSha,
    branch,
    pullRequestNumber,
    pullRequestUrl,
    diagnostics,
    createdAt,
    finishedAt,
  } = row;
  return serializeDates({
    proposalId,
    mode,
    title,
    status,
    baseSha,
    commitSha,
    mergedCommitSha,
    branch,
    pullRequestNumber,
    pullRequestUrl,
    diagnostics,
    createdAt,
    finishedAt,
    captured: row.changes.map((change) => ({
      documentId: change.documentId,
      draftVersion: change.draftVersion,
      sourcePath: change.base?.sourcePath ?? null,
      targetPath: change.target?.sourcePath ?? null,
    })),
  });
}
/** Capture private exact-version intent atomically. A worker must validate the
 * complete repository candidate and recheck this authority before writing Git. */
export async function submitGitProposal(
  teamId: string,
  credential: GitPublisherCredential,
  raw: unknown,
) {
  const parsed = documentationGitProposalBodySchema.safeParse(raw);
  if (!parsed.success)
    throw new DocsContentError(
      parsed.error.issues.map((issue) =>
        diagnostic("INVALID_REQUEST", issue.message, {
          fieldPath: issue.path.join("."),
        }),
      ),
    );
  const input = parsed.data,
    inputHash = digest(input);
  return db.transaction(async (tx) => {
    const settings = await lockSettings(tx, teamId);
    await assertGitPublisherCredential(teamId, credential, tx);
    const old = await tx.query.documentationGitProposals.findFirst({
      where: and(
        eq(proposals.teamId, teamId),
        eq(proposals.idempotencyKey, input.idempotencyKey),
      ),
    });
    if (old) {
      if (
        old.inputHash !== inputHash ||
        digest(old.actorCredential) !== digest(credential)
      )
        fail("IDEMPOTENCY_CONFLICT");
      return proposalProjection(old);
    }
    const binding = await tx.query.documentationGitBindings.findFirst({
      where: eq(bindings.teamId, teamId),
    });
    if (
      !binding ||
      settings.source !== "git" ||
      binding.status !== "connected" ||
      !binding.capabilities.read
    )
      fail("SOURCE_REQUIRES_GIT");
    if (
      !(input.mode === "pull_request"
        ? binding.capabilities.proposals
        : binding.capabilities.directCommit)
    )
      fail("GITHUB_WRITE_PERMISSION_REQUIRED");
    const chosen = [...input.selected, ...input.removals],
      ids = chosen.map((d) => d.documentId);
    if (new Set(ids).size !== ids.length) fail("INVALID_PROPOSAL");
    const open = await tx.query.documentationGitProposalDocuments.findFirst({
      where: and(
        eq(proposalDocs.teamId, teamId),
        inArray(proposalDocs.documentId, ids),
        eq(proposalDocs.open, true),
      ),
    });
    if (open) fail("PROPOSAL_ALREADY_OPEN");
    await requireDocumentationWorkCapacity(tx, teamId);
    const changes: CapturedGitChange[] = [];
    let bytes = 0;
    for (const selection of chosen) {
      const doc = await tx.query.documents.findFirst({
        where: and(
          eq(documents.teamId, teamId),
          eq(documents.documentId, selection.documentId),
          eq(documents.kind, "doc"),
        ),
      });
      if (!doc || !(await documentationReadAllowed(teamId, doc, false, tx)))
        fail("GITHUB_PROPOSAL_UNAVAILABLE");
      if (doc.draftVersion !== selection.expectedDraftVersion)
        throw new DraftConflict(doc.draftVersion);
      const source = await gitDraftSource(tx, teamId, doc);
      const selected = input.selected.find((d) => d.documentId === doc.documentId);
      if (!selected && !source.base) fail("INVALID_PROPOSAL");
      let target: CapturedGitChange["target"] = null;
      if (selected) {
        const fm: Record<string, unknown> = {
          ...((doc.draftMeta.frontmatter ?? {}) as Record<string, unknown>),
          title: doc.draftTitle,
          slug: doc.draftSlug ?? doc.slug,
          description: doc.draftExcerpt ?? "",
          published: selected.published,
          indexable: doc.draftMeta.indexable !== false,
          nav_order: doc.draftMeta.order ?? 0,
        };
        if (doc.draftFeaturedImage)
          fm["featured_image"] = {
            url: doc.draftFeaturedImage.url,
            alt: doc.draftFeaturedImage.alt ?? "",
          };
        else delete fm["featured_image"];
        const markdown = serializeDocsMarkdown(
          doc.draftContent,
          requireDocsFrontmatter(fm, source.sourcePath),
        );
        bytes += Buffer.byteLength(markdown);
        if (bytes > 10 * 1024 * 1024) fail("CANDIDATE_LIMIT");
        target = { sourcePath: source.sourcePath, markdown };
      }
      changes.push({
        documentId: doc.documentId,
        draftVersion: doc.draftVersion,
        base: source.base,
        target,
      });
    }
    const [proposal] = await tx
      .insert(proposals)
      .values({
        teamId,
        idempotencyKey: input.idempotencyKey,
        inputHash,
        actorCredential: credential,
        sourceContext: {
          installationId: binding.installationId,
          repositoryId: binding.repositoryId,
          ownerId: binding.ownerId,
          branch: binding.branch,
          directory: binding.directory,
        },
        connectionGeneration: binding.generation,
        grantVersion: binding.grantVersion,
        mode: input.mode,
        title: input.title,
        changes,
      })
      .returning();
    await tx.insert(proposalDocs).values(
      changes.map((change) => ({
        teamId,
        proposalId: proposal.proposalId,
        documentId: change.documentId,
        draftVersion: change.draftVersion,
        sourcePath: change.base?.sourcePath ?? null,
        targetPath: change.target?.sourcePath ?? null,
      })),
    );
    return proposalProjection(proposal);
  });
}
