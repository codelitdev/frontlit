import { siteOriginForTeam } from "../utils/site-url";
import { activateGitRelease } from "../pages/git-import";
import {
  checkGitPublicationHead,
  enqueueGitSync,
  supersedeGitWork,
} from "./github/state";
import { GitHubDocsError } from "./github/app";
import {
  captureRetrievalConfiguration,
  prepareDocumentationRetrieval,
  semanticDocumentationScores,
} from "./retrieval";
import { createHash, randomUUID } from "node:crypto";
import { and, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "../db/client";
// All publication transaction reads use their transaction executor, including
// PGlite tests: rollback behavior is part of the acceptance contract.
const withDbTransaction = <T>(fn: (tx: any) => Promise<T>): Promise<T> =>
  db.transaction(fn);
import {
  documents,
  docSections,
  documentChunks,
  documentationSettings as settingsTable,
  documentationRevisions as revisions,
  documentationPublications as publications,
  documentationMemberships as memberships,
  documentationDeliveryOutbox as outbox,
  documentationPurges as purges,
  documentationGitBindings as gitBindings,
  documentationGitJobs as gitJobs,
  documentationGitFiles as gitFiles,
  documentationGitPreflights as gitPreflights,
  documentationGitMigrations as gitMigrations,
  documentationGitProposals as gitProposals,
  documentationGitChecks as gitChecks,
  documentationGitProposalDocuments as gitProposalDocs,
} from "../db/schema";
import { lockSettings, DraftConflict, draftReport } from "./authoring";
import { retainPurgeDeletionRecord } from "./deletion-ledger";
import {
  DocumentationAdmissionError,
  requireDocumentationWorkCapacity,
} from "./admission";
export { DocumentationAdmissionError } from "./admission";
import {
  DocsContentError,
  diagnostic,
  extractDocsHeadings,
  serializeDocsMarkdown,
  hashDocsContent,
  sortDiagnostics,
} from "@frontlit/text-editor/docs";
import {
  normalizeDocumentationContent,
  validateDocumentationFeaturedImage,
} from "./content-validation";
import { extractChunks } from "./chunking";

export function publicationError(code: string, message: string): never {
  throw new DocsContentError([diagnostic(code, message)]);
}
export const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const LEASE_MS = 120_000;

type Executor = any;
export type PublicationInput = {
  automatic?: true;
  includeSectionChanges?: boolean;
  selected: { documentId: string; expectedDraftVersion: number }[];
  removals: string[];
  expectedPublicationId: string | null;
  expectedDocsDraftVersion: number;
  idempotencyKey: string;
};
async function event(
  tx: Executor,
  teamId: string,
  settings: any,
  type: "activation" | "policy" | "purge",
  payload: any = {},
) {
  await tx.insert(outbox).values({
    teamId,
    publicationId: settings.activePublicationId,
    policyEpoch: settings.policyEpoch,
    type,
    payload,
    destinations: process.env.REVALIDATE_WEBHOOK_SECRET
      ? ["local", "sites"]
      : ["local"],
  });
}

export async function captureRevision(tx: Executor, row: any, live = false) {
  const tombstones = await tx.query.documentationPurges.findMany({
    where: and(eq(purges.teamId, row.teamId), eq(purges.status, "completed")),
  });
  if (
    tombstones.some(
      (p: any) =>
        p.manifest.documentIds.includes(row.documentId) ||
        p.manifest.routes.includes(live ? row.slug : (row.draftSlug ?? row.slug)),
    )
  )
    publicationError(
      "PURGED_IDENTITY",
      "This identity or route was purged and cannot be recreated by publication.",
    );
  const snapshot = {
    documentId: row.documentId,
    draftVersion: row.draftVersion,
    draftTitle: live ? row.title : row.draftTitle,
    draftSlug: live ? row.slug : (row.draftSlug ?? row.slug),
    draftContent: normalizeDocumentationContent(live ? row.content : row.draftContent),
    draftExcerpt: live ? row.excerpt : row.draftExcerpt,
    draftFeaturedImage: live ? row.featuredImage : row.draftFeaturedImage,
    draftMeta: live ? row.meta : row.draftMeta,
  };
  validateDocumentationFeaturedImage(snapshot.draftFeaturedImage);
  const markdown = serializeDocsMarkdown(snapshot.draftContent);
  const hash = await hashDocsContent({
    content: snapshot.draftContent,
    metadata: {
      title: snapshot.draftTitle,
      slug: snapshot.draftSlug,
      excerpt: snapshot.draftExcerpt,
      featuredImage: snapshot.draftFeaturedImage,
      ...snapshot.draftMeta,
    },
    embeddingConfigurationVersion: "publication-lexical-v1",
  });
  const existing = await tx.query.documentationRevisions.findFirst({
    where: and(
      eq(revisions.teamId, row.teamId),
      eq(revisions.documentId, row.documentId),
      eq(revisions.hash, hash),
    ),
  });
  if (existing) return existing;
  const [revision] = await tx
    .insert(revisions)
    .values({
      teamId: row.teamId,
      documentId: row.documentId,
      snapshot,
      hash,
      markdown,
      headings: extractDocsHeadings(snapshot.draftContent),
      chunks: extractChunks(snapshot.draftContent),
    })
    .returning();
  return revision;
}

/** Upgrade existing live docs without resetting drafts or changing routes. Runs
 * under the authoring lock; no public fallback to mutable columns afterward. */
export async function bootstrapDocumentation(teamId: string, executor?: Executor) {
  const run = async (tx: Executor) => {
    const settings = await lockSettings(tx, teamId);
    if (settings.activePublicationId) return settings;
    const rows = await tx.query.documents.findMany({
      where: and(eq(documents.teamId, teamId), eq(documents.kind, "doc")),
    });
    const live = rows.filter((r: any) => r.publishedAt);
    if (!live.length) return settings;
    const navigation = await tx.query.docSections.findMany({
      where: eq(docSections.teamId, teamId),
      orderBy: docSections.order,
    });
    const [publication] = await tx
      .insert(publications)
      .values({
        teamId,
        idempotencyKey: "bootstrap-v1",
        admissionType: "automatic",
        inputHash: "bootstrap-v1",
        source: settings.source,
        generation: settings.requestedGeneration,
        purgeGeneration: settings.purgeGeneration,
        docsDraftVersion: settings.draftVersion,
        indexing: await captureRetrievalConfiguration(teamId, settings.indexing, tx),
        navigation,
        status: "active",
        activatedAt: new Date(),
        finishedAt: new Date(),
      })
      .returning();
    for (const row of live) {
      const revision = await captureRevision(tx, row, true);
      await tx.insert(memberships).values({
        publicationId: publication.publicationId,
        documentId: row.documentId,
        revisionId: revision.revisionId,
        route: row.slug,
      });
    }
    const [updated] = await tx
      .update(settingsTable)
      .set({ activePublicationId: publication.publicationId })
      .where(eq(settingsTable.teamId, teamId))
      .returning();
    await event(tx, teamId, updated, "activation");
    return updated;
  };
  return executor ? run(executor) : withDbTransaction(run);
}

export async function queuePublication(
  teamId: string,
  input: PublicationInput,
  executor?: Executor,
) {
  if (process.env.DOCS_RESTORE_PENDING === "true")
    publicationError(
      "RESTORE_PENDING",
      "Replay the deletion ledger before enabling documentation.",
    );
  const run = async (tx: Executor) => {
    const settings = await bootstrapDocumentation(teamId, tx);
    const inputHash = digest({
      selected: input.selected.map(({ documentId, expectedDraftVersion }) => ({
        documentId,
        expectedDraftVersion,
      })),
      removals: input.removals,
      includeSectionChanges: input.includeSectionChanges ?? true,
      expectedPublicationId: input.expectedPublicationId,
      expectedDocsDraftVersion: input.expectedDocsDraftVersion,
      idempotencyKey: input.idempotencyKey,
    });
    const replay = await tx.query.documentationPublications.findFirst({
      where: and(
        eq(publications.teamId, teamId),
        eq(publications.idempotencyKey, input.idempotencyKey),
      ),
    });
    if (replay) {
      if (replay.inputHash !== inputHash)
        publicationError(
          "IDEMPOTENCY_CONFLICT",
          "This key was used with different input.",
        );
      return replay;
    }
    if (settings.source !== "editor")
      publicationError(
        "SOURCE_REQUIRES_GIT",
        "This documentation area is owned by Git.",
      );
    if (settings.activePublicationId !== input.expectedPublicationId)
      publicationError(
        "STALE_PUBLICATION",
        "The active publication changed. Review the new publication.",
      );
    if (settings.draftVersion !== input.expectedDocsDraftVersion)
      throw new DraftConflict(settings.draftVersion);
    if (
      new Set(input.selected.map((x) => x.documentId)).size !== input.selected.length ||
      new Set(input.removals).size !== input.removals.length ||
      input.selected.some((x) => input.removals.includes(x.documentId))
    )
      publicationError(
        "INVALID_REQUEST",
        "Selections and removals must be unique and disjoint.",
      );
    const pending = await tx.query.documentationPublications.findMany({
      where: eq(publications.teamId, teamId),
    });
    if (
      pending.filter((p: any) => ["queued", "preparing", "prepared"].includes(p.status))
        .length >= 2
    )
      throw new DocumentationAdmissionError(
        "PUBLICATION_BUSY",
        "Two publications are already pending. Retry later.",
        5,
      );
    if (!input.automatic) await requireDocumentationWorkCapacity(tx, teamId);
    const rows = await tx.query.documents.findMany({
      where: and(eq(documents.teamId, teamId), eq(documents.kind, "doc")),
    });
    for (const selected of input.selected) {
      const row = rows.find((r: any) => r.documentId === selected.documentId);
      if (!row) publicationError("INVALID_REFERENCE", "Invalid document reference.");
      if (row.draftVersion !== selected.expectedDraftVersion)
        throw new DraftConflict(row.draftVersion);
    }
    const base = settings.activePublicationId
      ? await tx.query.documentationMemberships.findMany({
          where: eq(memberships.publicationId, settings.activePublicationId),
        })
      : [];
    if (input.removals.some((id) => !base.some((m: any) => m.documentId === id)))
      publicationError("INVALID_REFERENCE", "Removal must name an active document.");
    const active = settings.activePublicationId
      ? await tx.query.documentationPublications.findFirst({
          where: eq(publications.publicationId, settings.activePublicationId),
        })
      : null;
    const navigation =
      input.includeSectionChanges === false
        ? (active?.navigation ?? [])
        : await tx.query.docSections.findMany({
            where: eq(docSections.teamId, teamId),
            orderBy: docSections.order,
          });
    if (
      input.includeSectionChanges === false &&
      input.selected.some((selected) => {
        const row = rows.find((r: any) => r.documentId === selected.documentId);
        const sectionId = row?.draftMeta?.sectionId;
        return sectionId && !navigation.some((s: any) => s.sectionId === sectionId);
      })
    )
      publicationError(
        "SECTION_NOT_PUBLISHED",
        "Include Section changes to publish a draft in a new Section.",
      );
    const generation = settings.requestedGeneration + 1;
    const [job] = await tx
      .insert(publications)
      .values({
        teamId,
        idempotencyKey: input.idempotencyKey,
        admissionType: input.automatic ? "automatic" : "explicit",
        inputHash,
        basePublicationId: settings.activePublicationId,
        generation,
        purgeGeneration: settings.purgeGeneration,
        source: settings.source,
        docsDraftVersion: settings.draftVersion,
        indexing: await captureRetrievalConfiguration(teamId, settings.indexing, tx),
        navigation,
      })
      .returning();
    const selectedIds = input.selected.map((x) => x.documentId);
    const candidates: { documentId: string; revisionId: string; route: string }[] =
      base.filter(
        (m: any) =>
          !selectedIds.includes(m.documentId) && !input.removals.includes(m.documentId),
      );
    for (const selected of input.selected) {
      const row = rows.find((r: any) => r.documentId === selected.documentId)!;
      const revision = await captureRevision(tx, row);
      candidates.push({
        documentId: selected.documentId,
        revisionId: revision.revisionId,
        route: revision.snapshot.draftSlug,
      });
    }
    if (candidates.length > 1000)
      publicationError(
        "CANDIDATE_LIMIT",
        "A publication may contain at most 1000 documents.",
      );
    if (new Set(candidates.map((m: any) => m.route)).size !== candidates.length)
      publicationError("DUPLICATE_ROUTE", "Candidate routes must be unique.");
    if (candidates.length)
      await tx.insert(memberships).values(
        candidates.map((m: any) => ({
          publicationId: job.publicationId,
          documentId: m.documentId,
          revisionId: m.revisionId,
          route: m.route,
        })),
      );
    await tx
      .update(settingsTable)
      .set({ requestedGeneration: generation })
      .where(eq(settingsTable.teamId, teamId));
    return job;
  };
  return executor ? run(executor) : withDbTransaction(run);
}

/** Rebuild immutable retrieval membership without selecting or publishing drafts. */
export async function rebuildDocumentationRetrieval(
  teamId: string,
  executor?: Executor,
) {
  const run = async (tx: Executor) => {
    const settings = await lockSettings(tx, teamId);
    if (!settings.activePublicationId) return null;
    const active = await tx.query.documentationPublications.findFirst({
      where: eq(publications.publicationId, settings.activePublicationId),
    });
    const indexing = await captureRetrievalConfiguration(teamId, settings.indexing, tx);
    const identity = (value: any) => [
      value?.enabled,
      value?.mode ?? "lexical",
      value?.configHash ?? null,
    ];
    if (digest(identity(indexing)) === digest(identity(active?.indexing))) return null;
    if (settings.source === "git") {
      const binding = await tx.query.documentationGitBindings.findFirst({
        where: eq(gitBindings.teamId, teamId),
      });
      if (binding?.status !== "connected" || !binding.capabilities.read) return null;
      // Fetch the canonical Git commit again; local proposals cannot become
      // publication input just because the retrieval configuration changed.
      return enqueueGitSync(
        teamId,
        {
          trigger: "configuration",
          expectedGeneration: binding.generation,
          expectedRequestGeneration: binding.requestedGeneration,
        },
        tx,
      );
    }
    return queuePublication(
      teamId,
      {
        automatic: true,
        selected: [],
        removals: [],
        includeSectionChanges: false,
        expectedPublicationId: settings.activePublicationId,
        expectedDocsDraftVersion: settings.draftVersion,
        idempotencyKey: `retrieval:${settings.activePublicationId}:${settings.draftVersion}:${digest(indexing)}`,
      },
      tx,
    );
  };
  return executor ? run(executor) : withDbTransaction(run);
}

export async function getPublication(teamId: string, publicationId: string) {
  return db.query.documentationPublications.findFirst({
    where: and(
      eq(publications.teamId, teamId),
      eq(publications.publicationId, publicationId),
    ),
  });
}
async function candidateRows(publicationId: string) {
  return db
    .select({ member: memberships, revision: revisions })
    .from(memberships)
    .innerJoin(revisions, eq(memberships.revisionId, revisions.revisionId))
    .where(eq(memberships.publicationId, publicationId));
}
export async function claimPublication(teamId?: string, publicationId?: string) {
  const now = new Date();
  await db
    .update(publications)
    .set({
      status: "failed",
      finishedAt: now,
      leaseToken: null,
      leaseExpiresAt: null,
      diagnostics: [
        diagnostic(
          "RETRIES_EXHAUSTED",
          "Publication exhausted its preparation attempts.",
        ),
      ],
    })
    .where(
      and(
        inArray(publications.status, ["preparing", "prepared"]),
        lte(publications.leaseExpiresAt, sql`now()`),
        sql`${publications.attempts} >= 5`,
      ),
    );
  const jobs = await db.query.documentationPublications.findMany({
    where: and(
      ...(teamId ? [eq(publications.teamId, teamId)] : []),
      ...(publicationId ? [eq(publications.publicationId, publicationId)] : []),
      lte(publications.nextAttemptAt, sql`now()`),
      sql`${publications.attempts} < 5`,
      or(
        eq(publications.status, "queued"),
        and(
          inArray(publications.status, ["preparing", "prepared"]),
          lte(publications.leaseExpiresAt, sql`now()`),
        ),
      ),
    ),
    orderBy: [publications.nextAttemptAt, publications.createdAt],
    limit: 20,
  });
  if (!jobs.length) return null;
  for (const job of jobs) {
    const result = await withDbTransaction(async (tx) => {
      await lockSettings(tx, job.teamId);
      const running = await tx.query.documentationPublications.findMany({
        where: and(
          eq(publications.teamId, job.teamId),
          inArray(publications.status, ["preparing", "prepared"]),
          sql`${publications.leaseExpiresAt} > now()`,
        ),
      });
      if (running.length) return null;
      const [claimed] = await tx
        .update(publications)
        .set({
          status: "preparing",
          attempts: job.attempts + 1,
          leaseToken: randomUUID(),
          leaseExpiresAt: new Date(Date.now() + LEASE_MS),
        })
        .where(
          and(
            eq(publications.publicationId, job.publicationId),
            eq(publications.attempts, job.attempts),
            or(
              eq(publications.status, "queued"),
              and(
                inArray(publications.status, ["preparing", "prepared"]),
                lte(publications.leaseExpiresAt, sql`now()`),
              ),
            ),
          ),
        )
        .returning();
      return claimed ?? null;
    });
    if (result) return result;
  }
  return null;
}
export async function preparePublication(job: typeof publications.$inferSelect) {
  const rows = await candidateRows(job.publicationId);
  const candidates = rows.map((r) => r.revision.snapshot);
  if (
    rows.reduce((n, r) => n + Buffer.byteLength(r.revision.markdown), 0) >
    10 * 1024 * 1024
  )
    publicationError("CANDIDATE_LIMIT", "Publication text exceeds 10 MiB.");
  const diagnostics: any[] = [];
  for (const row of rows) {
    await db
      .update(publications)
      .set({ leaseExpiresAt: new Date(Date.now() + LEASE_MS) })
      .where(
        and(
          eq(publications.publicationId, job.publicationId),
          eq(publications.leaseToken, job.leaseToken!),
          sql`${publications.leaseExpiresAt} > now()`,
        ),
      );
    const report = await draftReport(job.teamId, row.revision.snapshot, {
      documentId: row.member.documentId,
      candidates,
      publicationId: job.basePublicationId,
      sections: job.navigation,
    });
    diagnostics.push(...report.diagnostics);
  }
  if (!diagnostics.some((d) => d.blocksPublish))
    await prepareDocumentationRetrieval(
      job,
      rows.map((r) => r.revision),
    );
  const blocked = diagnostics.some((d) => d.blocksPublish);
  const retry =
    blocked &&
    job.attempts < 5 &&
    diagnostics
      .filter((d) => d.blocksPublish)
      .every((d) => d.code === "MEDIA_UNAVAILABLE");
  const [updated] = await db
    .update(publications)
    .set({
      status: retry ? "queued" : blocked ? "failed" : "prepared",
      diagnostics: sortDiagnostics(diagnostics),
      ...(retry
        ? {
            nextAttemptAt: new Date(
              Date.now() + Math.min(300000, 5000 * 2 ** (job.attempts - 1)),
            ),
          }
        : {}),
      ...(blocked
        ? {
            finishedAt: retry ? null : new Date(),
            leaseToken: null,
            leaseExpiresAt: null,
          }
        : {}),
    })
    .where(
      and(
        eq(publications.publicationId, job.publicationId),
        eq(publications.leaseToken, job.leaseToken!),
        eq(publications.status, "preparing"),
        sql`${publications.leaseExpiresAt} > now()`,
      ),
    )
    .returning();
  return updated;
}
export async function activatePublication(
  teamId: string,
  publicationId: string,
  leaseToken: string,
  verifiedGitHead?: string,
) {
  if (process.env.DOCS_RESTORE_PENDING === "true")
    publicationError(
      "RESTORE_PENDING",
      "Replay the deletion ledger before enabling documentation.",
    );
  return withDbTransaction(async (tx) => {
    const settings = await lockSettings(tx, teamId);
    const job = await tx.query.documentationPublications.findFirst({
      where: and(
        eq(publications.publicationId, publicationId),
        eq(publications.teamId, teamId),
      ),
    });
    if (!job) return null;
    // Retry after commit returns the same outcome, including archived success.
    if (job.activatedAt) return job;
    if (
      job.source === "git" &&
      (!job.gitContext || verifiedGitHead !== job.gitContext.commitSha)
    )
      publicationError(
        "GITHUB_SOURCE_PROVENANCE_REQUIRED",
        "A fresh GitHub branch-head verification is required.",
      );
    const binding =
      job.source === "git"
        ? await tx.query.documentationGitBindings.findFirst({
            where: eq(gitBindings.teamId, teamId),
          })
        : null;
    if (
      job.status !== "prepared" ||
      job.leaseToken !== leaseToken ||
      !job.leaseExpiresAt ||
      job.leaseExpiresAt.getTime() <= Date.now()
    )
      publicationError(
        "LEASE_LOST",
        "Publication lease expired or belongs to another worker.",
      );
    if (
      settings.activePublicationId !== job.basePublicationId ||
      settings.requestedGeneration !== job.generation ||
      settings.purgeGeneration !== job.purgeGeneration ||
      settings.source !== job.source ||
      (job.source === "git" &&
        (!job.gitContext ||
          !binding ||
          binding.status !== "connected" ||
          !binding.capabilities.read ||
          binding.generation !== job.gitContext.connectionGeneration ||
          binding.requestedGeneration !== job.gitContext.requestGeneration ||
          binding.repositoryId !== job.gitContext.repositoryId ||
          binding.ownerId !== job.gitContext.ownerId ||
          binding.installationId !== job.gitContext.installationId))
    ) {
      const [stale] = await tx
        .update(publications)
        .set({
          status: "superseded",
          finishedAt: new Date(),
          leaseToken: null,
          leaseExpiresAt: null,
        })
        .where(eq(publications.publicationId, publicationId))
        .returning();
      return stale;
    }
    const rows = await tx
      .select({ member: memberships, revision: revisions })
      .from(memberships)
      .innerJoin(revisions, eq(memberships.revisionId, revisions.revisionId))
      .where(eq(memberships.publicationId, publicationId));
    const now = new Date();
    if (settings.activePublicationId)
      await tx
        .update(publications)
        .set({ status: "archived", finishedAt: now })
        .where(eq(publications.publicationId, settings.activePublicationId));
    // Legacy columns remain an admin status projection. Public reads use membership.
    await tx
      .update(documents)
      .set({ publishedAt: null })
      .where(and(eq(documents.teamId, teamId), eq(documents.kind, "doc")));
    for (const row of rows) {
      const s = row.revision.snapshot;
      await tx
        .update(documents)
        .set({
          slug: row.member.route,
          title: s.draftTitle,
          content: s.draftContent,
          excerpt: s.draftExcerpt,
          featuredImage: s.draftFeaturedImage,
          meta: s.draftMeta,
          publishedAt: now,
        })
        .where(
          and(
            eq(documents.teamId, teamId),
            eq(documents.documentId, row.member.documentId),
          ),
        );
    }
    for (const row of rows) {
      await tx.execute(
        sql`update documentation_improvements set state='published', revision_id=${row.revision.revisionId}, publication_id=${publicationId}, version=version+1, updated_at=now() where team_id=${teamId} and state='draft_created' and draft_document_id=${row.member.documentId} and draft_hash=${await hashDocsContent({ content: row.revision.snapshot.draftContent, metadata: { title: row.revision.snapshot.draftTitle, slug: row.revision.snapshot.draftSlug, description: row.revision.snapshot.draftExcerpt, ...row.revision.snapshot.draftMeta }, embeddingConfigurationVersion: "authoring-v1" })}`,
      );
    }
    const [updated] = await tx
      .update(settingsTable)
      .set({ activePublicationId: publicationId })
      .where(eq(settingsTable.teamId, teamId))
      .returning();
    const [active] = await tx
      .update(publications)
      .set({
        status: "active",
        activatedAt: now,
        finishedAt: now,
        leaseToken: null,
        leaseExpiresAt: null,
      })
      .where(eq(publications.publicationId, publicationId))
      .returning();
    await event(tx, teamId, updated, "activation");
    if (job.gitContext) {
      // Only this candidate's proven merged proposals become applied, atomically
      // with activation. Captured versions remain on links; drafts are untouched.
      if (job.gitContext.proposalIds?.length) {
        const applied = await tx
          .update(gitProposals)
          .set({ status: "published", finishedAt: now })
          .where(
            and(
              eq(gitProposals.teamId, teamId),
              eq(gitProposals.status, "merged"),
              inArray(gitProposals.proposalId, job.gitContext.proposalIds),
            ),
          )
          .returning({ proposalId: gitProposals.proposalId });
        if (applied.length)
          await tx
            .update(gitProposalDocs)
            .set({ open: false })
            .where(
              and(
                eq(gitProposalDocs.teamId, teamId),
                inArray(
                  gitProposalDocs.proposalId,
                  applied.map((p: any) => p.proposalId),
                ),
              ),
            );
      }
      await tx
        .update(gitBindings)
        .set({
          liveSha: job.gitContext.commitSha,
          docsSourceKey: job.gitContext.docsTreeSha ?? null,
          lastSuccessfulSyncAt: now,
          lastDiagnostic: null,
        })
        .where(eq(gitBindings.teamId, teamId));
      await tx
        .update(gitJobs)
        .set({
          status: "active",
          finishedAt: now,
          leaseToken: null,
          leaseExpiresAt: null,
        })
        .where(
          and(eq(gitJobs.teamId, teamId), eq(gitJobs.runId, job.gitContext.runId)),
        );
      // Pages from the same commit go live with this publication.
      await activateGitRelease(tx, teamId, publicationId);
    }
    return active;
  });
}
async function settleGitPublication(
  job: typeof publications.$inferSelect,
  outcome: typeof publications.$inferSelect | null | undefined,
) {
  if (!job.gitContext || !outcome || !["failed", "superseded"].includes(outcome.status))
    return;
  await db
    .update(gitJobs)
    .set({
      status: outcome.status as "failed" | "superseded",
      finishedAt: new Date(),
      diagnostic: outcome.diagnostics[0]?.code ?? null,
    })
    .where(
      and(
        eq(gitJobs.runId, job.gitContext.runId),
        eq(gitJobs.publicationId, job.publicationId),
        eq(gitJobs.status, "preparing"),
      ),
    );
  await db
    .update(gitBindings)
    .set({ lastDiagnostic: outcome.diagnostics[0]?.code ?? null })
    .where(
      and(
        eq(gitBindings.teamId, job.teamId),
        eq(gitBindings.generation, job.gitContext.connectionGeneration),
        eq(gitBindings.requestedGeneration, job.gitContext.requestGeneration),
      ),
    );
}
export async function processPublication(teamId?: string, publicationId?: string) {
  const job = await claimPublication(teamId, publicationId);
  if (!job) return null;
  try {
    const prepared = await preparePublication(job);
    if (prepared?.status !== "prepared") {
      await settleGitPublication(job, prepared);
      return prepared;
    }
    if (job.source === "git" && !(await checkGitPublicationHead(job)))
      publicationError(
        "SUPERSEDED_GENERATION",
        "The GitHub branch head or delegated source generation changed.",
      );
    const activated = await activatePublication(
      job.teamId,
      job.publicationId,
      job.leaseToken!,
      job.gitContext?.commitSha,
    );
    await settleGitPublication(job, activated);
    return activated;
  } catch (error) {
    const diagnostics =
      error instanceof GitHubDocsError
        ? [diagnostic(error.code, "GitHub source verification did not succeed.")]
        : error instanceof DocsContentError
          ? error.diagnostics
          : [
              diagnostic(
                "PREPARATION_UNAVAILABLE",
                "Publication preparation is temporarily unavailable.",
              ),
            ];
    const progress = diagnostics.some((d) => d.code === "PREPARATION_PROGRESS");
    const superseded = diagnostics.some((d) =>
      ["SUPERSEDED_GENERATION", "GITHUB_SUPERSEDED"].includes(d.code),
    );
    const rateLimited =
      error instanceof GitHubDocsError && error.code === "GITHUB_RATE_LIMITED";
    const transient =
      (!(error instanceof DocsContentError) && !(error instanceof GitHubDocsError)) ||
      diagnostics.some((d) =>
        [
          "MEDIA_UNAVAILABLE",
          "PREPARATION_UNAVAILABLE",
          "GITHUB_UNAVAILABLE",
          "GITHUB_RATE_LIMITED",
        ].includes(d.code),
      );
    const [failed] = await db
      .update(publications)
      .set({
        status: superseded
          ? "superseded"
          : progress || rateLimited || (transient && job.attempts < 5)
            ? "queued"
            : "failed",
        diagnostics: progress ? [] : diagnostics,
        ...(progress || rateLimited ? { attempts: job.attempts - 1 } : {}),
        nextAttemptAt: new Date(
          Math.max(
            error instanceof GitHubDocsError ? (error.retryAt?.getTime() ?? 0) : 0,
            Date.now() +
              (progress ? 1000 : Math.min(300000, 5000 * 2 ** (job.attempts - 1))),
          ),
        ),
        leaseToken: null,
        leaseExpiresAt: null,
        finishedAt:
          progress || rateLimited || (transient && job.attempts < 5)
            ? null
            : new Date(),
      })
      .where(
        and(
          eq(publications.publicationId, job.publicationId),
          eq(publications.leaseToken, job.leaseToken!),
        ),
      )
      .returning();
    await settleGitPublication(job, failed);
    return failed;
  }
}

export async function readDocumentation(
  teamId: string,
  expected?: { publicationId?: string | null; policyEpoch?: number },
) {
  if (process.env.DOCS_RESTORE_PENDING === "true")
    publicationError(
      "RESTORE_PENDING",
      "Documentation is unavailable during backup restoration.",
    );
  await bootstrapDocumentation(teamId);
  const settings = await db.query.documentationSettings.findFirst({
    where: eq(settingsTable.teamId, teamId),
  });
  const identity = {
    publicationId: settings?.activePublicationId ?? null,
    policyEpoch: settings?.policyEpoch ?? 0,
  };
  if (
    expected &&
    ((expected.publicationId !== undefined &&
      expected.publicationId !== identity.publicationId) ||
      (expected.policyEpoch !== undefined &&
        expected.policyEpoch !== identity.policyEpoch))
  )
    publicationError("STALE_PUBLICATION", "The live publication or policy changed.");
  const publication = identity.publicationId
    ? await getPublication(teamId, identity.publicationId)
    : null;
  const rows = publication ? await candidateRows(publication.publicationId) : [];
  const items = rows.map((r) => ({
    ...r.revision.snapshot,
    documentId: r.member.documentId,
    revisionId: r.revision.revisionId,
    revisionHash: r.revision.hash,
    _chunks: r.revision.chunks,
    slug: r.member.route,
    title: r.revision.snapshot.draftTitle,
    content: r.revision.snapshot.draftContent,
    excerpt: r.revision.snapshot.draftExcerpt,
    featuredImage: r.revision.snapshot.draftFeaturedImage,
    meta: r.revision.snapshot.draftMeta,
    publishedAt: publication!.activatedAt,
    createdAt: r.revision.createdAt,
    updatedAt: r.revision.createdAt,
    ...identity,
  }));
  // Recheck policy after loading immutable rows; no content leaves on an epoch race.
  const final = await db.query.documentationSettings.findFirst({
    where: eq(settingsTable.teamId, teamId),
  });
  if ((final?.policyEpoch ?? 0) !== identity.policyEpoch)
    return readDocumentation(teamId, expected);
  return {
    ...identity,
    items,
    indexing: publication?.indexing ?? { enabled: true },
    sections: (publication?.navigation ?? [])
      .filter((s) => items.some((i) => i.meta.sectionId === s.sectionId))
      .map((s) => {
        const { id, teamId: ignored, ...section } = s;
        return section;
      }),
  };
}

export async function publishSingleDocument(
  teamId: string,
  documentId: string,
  expectedDraftVersion: number | undefined,
  context?: { expectedDocsDraftVersion: number; expectedPublicationId: string | null },
) {
  const row = await db.query.documents.findFirst({
    where: and(
      eq(documents.teamId, teamId),
      eq(documents.kind, "doc"),
      eq(documents.documentId, documentId),
    ),
  });
  if (!row) return null;
  if (row.draftVersion !== expectedDraftVersion)
    throw new DraftConflict(row.draftVersion);
  const settings = await bootstrapDocumentation(teamId);
  const job = await queuePublication(teamId, {
    selected: [{ documentId, expectedDraftVersion: expectedDraftVersion! }],
    removals: [],
    expectedDocsDraftVersion:
      context?.expectedDocsDraftVersion ?? settings.draftVersion,
    expectedPublicationId: context
      ? context.expectedPublicationId
      : settings.activePublicationId,
    idempotencyKey: `single:${documentId}:${row.draftVersion}:${settings.activePublicationId ?? "none"}:${settings.draftVersion}`,
  });
  const result = job.activatedAt
    ? job
    : await processPublication(teamId, job.publicationId);
  if (!result?.activatedAt)
    throw new DocsContentError(
      (result?.diagnostics?.length
        ? result.diagnostics
        : [
            diagnostic(
              "PUBLICATION_PENDING",
              "Publication is queued; check its status before retrying.",
            ),
          ]) as any,
    );
  const saved = (await db.query.documents.findFirst({
    where: eq(documents.documentId, documentId),
  }))!;
  return {
    ...saved,
    publicationId: result.publicationId,
    publishable: true,
    saved: false,
    diagnostics: result.diagnostics,
    validatedAgainstPublicationId: result.publicationId,
  };
}

/** Daily bounded cleanup. Membership foreign keys protect revisions still used
 * by active or leased preparations; deletion is local and transactionally ordered. */
export async function cleanupDocumentation(now = new Date(), limit = 100) {
  return withDbTransaction(async (tx) => {
    const candidates = await tx.query.documentationPublications.findMany({
      where: inArray(publications.status, ["archived", "failed", "superseded"]),
      limit,
    });
    let collected = 0;
    for (const job of candidates) {
      const settings = await lockSettings(tx, job.teamId);
      if (settings.activePublicationId === job.publicationId) continue;
      const ttl = job.activatedAt ? 30 : 7;
      if (!job.finishedAt || job.finishedAt.getTime() > now.getTime() - ttl * 86400000)
        continue;
      const expiredMembers = await tx.query.documentationMemberships.findMany({
        where: eq(memberships.publicationId, job.publicationId),
      });
      await tx
        .delete(memberships)
        .where(eq(memberships.publicationId, job.publicationId));
      if (!job.activatedAt) {
        for (const member of expiredMembers) {
          const protectedReference = await tx.query.documentationMemberships.findFirst({
            where: eq(memberships.revisionId, member.revisionId),
          });
          if (!protectedReference)
            await tx
              .delete(revisions)
              .where(eq(revisions.revisionId, member.revisionId));
        }
      }
      if (job.finishedAt.getTime() <= now.getTime() - 30 * 86400000) {
        await tx
          .delete(publications)
          .where(eq(publications.publicationId, job.publicationId));
        collected++;
      } else {
        // Keep a minimal receipt for 30 days after failed bodies expire at day 7.
        await tx
          .update(publications)
          .set({
            navigation: [],
            diagnostics: job.diagnostics.map((d: any) =>
              diagnostic(d.code, "Candidate data expired."),
            ),
          })
          .where(eq(publications.publicationId, job.publicationId));
      }
    }
    const old = await tx.query.documentationRevisions.findMany({
      where: lte(revisions.createdAt, new Date(now.getTime() - 30 * 86400000)),
      limit,
    });
    for (const revision of old) {
      await lockSettings(tx, revision.teamId);
      const reference = await tx.query.documentationMemberships.findFirst({
        where: eq(memberships.revisionId, revision.revisionId),
      });
      if (!reference)
        await tx.delete(revisions).where(eq(revisions.revisionId, revision.revisionId));
    }
    await tx
      .delete(purges)
      .where(and(eq(purges.status, "preflight"), lte(purges.expiresAt, now)));
    await tx
      .delete(outbox)
      .where(lte(outbox.completedAt, new Date(now.getTime() - 90 * 86400000)));
    await tx.execute(
      sql`delete from documentation_embedding_configs where config_hash in (select c.config_hash from documentation_embedding_configs c where not exists (select 1 from documentation_publications p where p.team_id=c.team_id and p.indexing->>'configHash'=c.config_hash) and c.created_at < ${new Date(now.getTime() - 30 * 86400000)} limit ${limit})`,
    );
    return { publications: collected };
  });
}

export async function preflightPurge(
  teamId: string,
  documentIds: string[],
  actorAccountId?: string,
) {
  return withDbTransaction(async (tx) => {
    const settings = await bootstrapDocumentation(teamId, tx);
    const pending = await tx.query.documentationPurges.findMany({
      where: and(
        eq(purges.teamId, teamId),
        eq(purges.status, "preflight"),
        sql`${purges.expiresAt} > now()`,
      ),
    });
    if (pending.length >= 10)
      throw new DocumentationAdmissionError(
        "PUBLICATION_BUSY",
        "Too many pending purge plans. Wait for a plan to expire.",
        600,
      );
    const rows = await tx.query.documents.findMany({
      where: and(eq(documents.teamId, teamId), eq(documents.kind, "doc")),
    });
    if (
      !documentIds.length ||
      documentIds.some((id) => !rows.some((r: any) => r.documentId === id))
    )
      publicationError("INVALID_REFERENCE", "Invalid purge target.");
    const retained = await tx.query.documentationRevisions.findMany({
      where: eq(revisions.teamId, teamId),
    });
    const selected = retained.filter((r: any) => documentIds.includes(r.documentId));
    // Media are retained: other consumers/provider CDN require separate authority.
    const manifest = {
      documentIds: [...new Set(documentIds)].sort(),
      revisionIds: selected.map((r: any) => r.revisionId).sort(),
      draftVersions: rows
        .filter((r: any) => documentIds.includes(r.documentId))
        .map((r: any) => ({
          documentId: r.documentId,
          version: r.draftVersion,
          hash: r.draftHash,
        })),
      routes: [
        ...new Set(
          [
            ...selected.map((r: any) => r.snapshot.draftSlug),
            ...rows
              .filter((r: any) => documentIds.includes(r.documentId))
              .flatMap((r: any) => [r.slug, r.draftSlug]),
          ].filter(
            (route): route is string => typeof route === "string" && route.length > 0,
          ),
        ),
      ],
      publicationId: settings.activePublicationId,
      policyEpoch: settings.policyEpoch,
      purgeGeneration: settings.purgeGeneration,
      retainedExternalCopies: [
        "Git source",
        "already sent customer messages",
        "public media/CDN copies",
        "backups (maximum 30 days)",
      ],
      mediaDeletion: "separate authorized operation",
    };
    const [plan] = await tx
      .insert(purges)
      .values({
        teamId,
        manifest,
        planHash: digest(manifest),
        actorAccountId,
        expiresAt: new Date(Date.now() + 600000),
      })
      .returning();
    return plan;
  });
}
export async function commitPurge(
  teamId: string,
  input: {
    planId: string;
    planHash: string;
    acknowledgment: "irreversible-deletion";
    idempotencyKey: string;
  },
  actor: {
    accountId?: string;
    isOwner: boolean;
    authKind: string;
    sessionAuthenticatedAt?: Date;
  },
) {
  if (
    !actor.isOwner ||
    actor.authKind !== "session" ||
    !actor.accountId ||
    !actor.sessionAuthenticatedAt ||
    Date.now() - actor.sessionAuthenticatedAt.getTime() > 600000
  )
    publicationError(
      "RECENT_OWNER_AUTH_REQUIRED",
      "Complete purge from a recently verified owner browser session.",
    );
  return withDbTransaction(async (tx) => {
    const settings = await lockSettings(tx, teamId);
    const plan = await tx.query.documentationPurges.findFirst({
      where: and(eq(purges.teamId, teamId), eq(purges.purgeId, input.planId)),
    });
    if (!plan) return null;
    if (plan.status === "completed") {
      if (
        plan.idempotencyKey === input.idempotencyKey &&
        plan.planHash === input.planHash
      ) {
        await retainPurgeDeletionRecord(tx, plan);
        return plan;
      }
      publicationError(
        "IDEMPOTENCY_CONFLICT",
        "Purge already committed with different input.",
      );
    }
    if (
      input.acknowledgment !== "irreversible-deletion" ||
      plan.planHash !== input.planHash ||
      plan.expiresAt.getTime() <= Date.now() ||
      plan.actorAccountId !== actor.accountId
    )
      publicationError("STALE_PURGE_PLAN", "Review a new purge plan.");
    const manifest = plan.manifest;
    const rows = await tx.query.documents.findMany({
      where: and(eq(documents.teamId, teamId), eq(documents.kind, "doc")),
    });
    if (
      settings.activePublicationId !== manifest.publicationId ||
      settings.policyEpoch !== manifest.policyEpoch ||
      settings.purgeGeneration !== manifest.purgeGeneration ||
      manifest.draftVersions.some(
        (v: any) =>
          !rows.some(
            (r: any) =>
              r.documentId === v.documentId &&
              r.draftVersion === v.version &&
              r.draftHash === v.hash,
          ),
      )
    )
      publicationError("STALE_PURGE_PLAN", "Docs changed after the purge review.");
    await retainPurgeDeletionRecord(tx, plan);
    await applyDocumentationPurge(tx, teamId, manifest, plan.purgeId);
    const [completed] = await tx
      .update(purges)
      .set({
        status: "completed",
        completedAt: new Date(),
        idempotencyKey: input.idempotencyKey,
      })
      .where(eq(purges.purgeId, plan.purgeId))
      .returning();
    return completed;
  });
}
/** Privileged replay shares the same physical erasure and generation fences.
 * This is not an API authority bypass: only the restore CLI calls it without a
 * recently verified owner, while serving/imports are held unavailable. */
export async function applyDocumentationPurge(
  tx: any,
  teamId: string,
  manifest: { documentIds: string[]; routes: string[] },
  purgeId: string,
) {
  const settings = await lockSettings(tx, teamId);
  const rows = await tx.query.documents.findMany({
    where: and(eq(documents.teamId, teamId), eq(documents.kind, "doc")),
  });
  const ids: string[] = manifest.documentIds;
  const revs = await tx.query.documentationRevisions.findMany({
    where: and(eq(revisions.teamId, teamId), inArray(revisions.documentId, ids)),
  });
  // Fence all pending jobs before removing the exact bodies. Retry cannot
  // reconstruct snapshots from drafts, and purge generation fences activation.
  await supersedeGitWork(tx, teamId);
  // Check diagnostics can retain paths/messages from purged prose. Preserve
  // only immutable proof/counts and stop every pending external report.
  await tx
    .update(gitChecks)
    .set({
      status: "superseded",
      finishedAt: new Date(),
      leaseToken: null,
      leaseExpiresAt: null,
      result: sql`case when ${gitChecks.result} is null then null else jsonb_set(${gitChecks.result}, '{diagnostics}', '[]'::jsonb) end`,
      publicationResult: sql`case when ${gitChecks.publicationResult} is null then null else jsonb_set(${gitChecks.publicationResult}, '{diagnostics}', '[]'::jsonb) end`,
    })
    .where(eq(gitChecks.teamId, teamId));
  // Temporary proposal bodies are private copied prose. Existing remote refs
  // are retained for audit; sensitive purge performs no GitHub mutations.
  await tx
    .update(gitProposals)
    .set({
      changes: [],
      diagnostics: [],
      title: "Purged documentation proposal",
      status: "canceled",
      finishedAt: new Date(),
      leaseToken: null,
      leaseExpiresAt: null,
    })
    .where(eq(gitProposals.teamId, teamId));
  await tx
    .update(gitProposalDocs)
    .set({ open: false })
    .where(eq(gitProposalDocs.teamId, teamId));
  await tx
    .update(gitBindings)
    .set({ generation: sql`${gitBindings.generation} + 1` })
    .where(eq(gitBindings.teamId, teamId));
  // Retain source identity/path tombstones, but erase copied canonical bodies.
  // This prevents an unchanged upstream path from acquiring a new document ID.
  await tx
    .update(gitFiles)
    .set({ markdown: "", frontmatter: {}, snapshot: {}, removedAt: new Date() })
    .where(and(eq(gitFiles.teamId, teamId), inArray(gitFiles.documentId, ids)));
  // Private whole-area export/preflight snapshots can contain the selected prose
  // at arbitrary locations. Invalidate these temporary team snapshots together.
  await tx
    .update(gitMigrations)
    .set({ files: [], sections: [], status: "canceled", verifiedSha: null })
    .where(
      and(
        eq(gitMigrations.teamId, teamId),
        inArray(gitMigrations.status, ["planned", "verified"]),
      ),
    );
  await tx
    .update(gitMigrations)
    .set({ files: [], sections: [] })
    .where(eq(gitMigrations.teamId, teamId));
  await tx.delete(gitPreflights).where(eq(gitPreflights.teamId, teamId));
  await tx
    .update(publications)
    .set({
      status: "superseded",
      finishedAt: new Date(),
      leaseToken: null,
      leaseExpiresAt: null,
      diagnostics: [],
    })
    .where(
      and(
        eq(publications.teamId, teamId),
        inArray(publications.status, ["queued", "preparing", "prepared"]),
      ),
    );
  if (revs.length) {
    await tx.delete(memberships).where(
      inArray(
        memberships.revisionId,
        revs.map((r: any) => r.revisionId),
      ),
    );
    await tx.delete(revisions).where(
      inArray(
        revisions.revisionId,
        revs.map((r: any) => r.revisionId),
      ),
    );
  }
  const internalIds = rows
    .filter((r: any) => ids.includes(r.documentId))
    .map((r: any) => r.id);
  if (internalIds.length)
    await tx
      .delete(documentChunks)
      .where(inArray(documentChunks.documentId, internalIds));
  await tx
    .delete(documents)
    .where(
      and(
        eq(documents.teamId, teamId),
        eq(documents.kind, "doc"),
        inArray(documents.documentId, ids),
      ),
    );
  await tx.execute(
    sql`delete from documentation_improvement_reviews where team_id=${teamId} and item_id in (select item_id from documentation_improvements where team_id=${teamId} and (target_document_id = ANY(ARRAY(select jsonb_array_elements_text(${JSON.stringify(ids)}::jsonb))) or draft_document_id = ANY(ARRAY(select jsonb_array_elements_text(${JSON.stringify(ids)}::jsonb)))))`,
  );
  await tx.execute(
    sql`delete from documentation_improvement_drafts where item_id in (select item_id from documentation_improvements where team_id=${teamId} and (target_document_id = ANY(ARRAY(select jsonb_array_elements_text(${JSON.stringify(ids)}::jsonb))) or draft_document_id = ANY(ARRAY(select jsonb_array_elements_text(${JSON.stringify(ids)}::jsonb)))))`,
  );
  await tx.execute(
    sql`update documentation_improvements set approved=null, draft_document_id=null, draft_version=null, draft_hash=null, revision_id=null, publication_id=null, version=version+1, updated_at=now() where team_id=${teamId} and (target_document_id = ANY(ARRAY(select jsonb_array_elements_text(${JSON.stringify(ids)}::jsonb))) or draft_document_id = ANY(ARRAY(select jsonb_array_elements_text(${JSON.stringify(ids)}::jsonb))))`,
  );
  await tx.execute(
    sql`delete from documentation_evidence where team_id=${teamId} and (item_id in (select item_id from documentation_improvements where team_id=${teamId} and target_document_id = ANY(ARRAY(select jsonb_array_elements_text(${JSON.stringify(ids)}::jsonb)))) or exists (select 1 from jsonb_array_elements(retrieved) r where r->>'documentId' = ANY(ARRAY(select jsonb_array_elements_text(${JSON.stringify(ids)}::jsonb)))))`,
  );
  await tx
    .update(gitJobs)
    .set({ diagnosticReport: null })
    .where(eq(gitJobs.teamId, teamId));
  // Reports are diagnostics only; clear them to avoid authored text in errors.
  await tx
    .update(publications)
    .set({ diagnostics: [] })
    .where(eq(publications.teamId, teamId));
  const [updated] = await tx
    .update(settingsTable)
    .set({
      policyEpoch: settings.policyEpoch + 1,
      purgeGeneration: settings.purgeGeneration + 1,
      draftVersion: settings.draftVersion + 1,
    })
    .where(eq(settingsTable.teamId, teamId))
    .returning();
  await event(tx, teamId, updated, "purge", { purgeId: purgeId });
  return updated;
}
export async function getPurge(teamId: string, purgeId: string) {
  return db.query.documentationPurges.findFirst({
    where: and(eq(purges.teamId, teamId), eq(purges.purgeId, purgeId)),
  });
}

export async function deliverDocumentationEvent(
  deliver: (
    destination: string,
    event: typeof outbox.$inferSelect,
  ) => Promise<void> = async (destination, event) => {
    if (destination === "sites") {
      const { findTeamById } = await import("../team/queries.js");
      const { signWebhookPayload } = await import("../services/webhook-signing.js");
      const team = await findTeamById(event.teamId);
      const secret = process.env.REVALIDATE_WEBHOOK_SECRET;
      if (!team || !secret) throw new Error("Documentation delivery is not configured");
      const body = JSON.stringify({
        eventId: event.eventId,
        type: event.type,
        teamId: team.teamId,
        publicationId: event.publicationId,
        policyEpoch: event.policyEpoch,
      });
      const timestamp = Date.now();
      const response = await fetch(
        `${process.env.SITES_BASE_URL || "http://localhost:3002"}/api/webhooks/documentation`,
        {
          method: "POST",
          body,
          headers: {
            "content-type": "application/json",
            "x-frontlit-timestamp": String(timestamp),
            "x-frontlit-signature": signWebhookPayload(secret, body, timestamp),
          },
          signal: AbortSignal.timeout(10000),
        },
      );
      if (!response.ok) throw new Error("Documentation destination rejected delivery");
      return;
    }
    if (destination !== "local")
      throw new Error("Unconfigured documentation delivery destination");
    const rows = await db.query.documents.findMany({
      where: and(eq(documents.teamId, event.teamId), eq(documents.kind, "doc")),
      columns: { id: true },
    });
    if (rows.length)
      await db.delete(documentChunks).where(
        inArray(
          documentChunks.documentId,
          rows.map((r) => r.id),
        ),
      );
  },
) {
  const now = sql`now()`;
  const row = await db.query.documentationDeliveryOutbox.findFirst({
    where: and(
      isNull(outbox.completedAt),
      lte(outbox.nextAttemptAt, now),
      or(isNull(outbox.leaseExpiresAt), lte(outbox.leaseExpiresAt, now)),
    ),
    orderBy: outbox.createdAt,
  });
  if (!row) return false;
  const token = randomUUID();
  const [claimed] = await db
    .update(outbox)
    .set({
      leaseToken: token,
      leaseExpiresAt: new Date(Date.now() + LEASE_MS),
      attempts: row.attempts + 1,
    })
    .where(
      and(
        eq(outbox.eventId, row.eventId),
        or(isNull(outbox.leaseExpiresAt), lte(outbox.leaseExpiresAt, now)),
      ),
    )
    .returning();
  if (!claimed) return false;
  const acknowledgments = [...claimed.acknowledgments];
  try {
    for (const destination of claimed.destinations) {
      if (acknowledgments.includes(destination)) continue;
      await deliver(destination, claimed);
      acknowledgments.push(destination);
      await db
        .update(outbox)
        .set({ acknowledgments })
        .where(and(eq(outbox.eventId, claimed.eventId), eq(outbox.leaseToken, token)));
    }
    await db
      .update(outbox)
      .set({ completedAt: new Date(), leaseToken: null, leaseExpiresAt: null })
      .where(and(eq(outbox.eventId, claimed.eventId), eq(outbox.leaseToken, token)));
  } catch {
    await db
      .update(outbox)
      .set({
        nextAttemptAt: new Date(
          Date.now() + Math.min(300000, 5000 * 2 ** Math.min(claimed.attempts, 6)),
        ),
        leaseToken: null,
        leaseExpiresAt: null,
      })
      .where(and(eq(outbox.eventId, claimed.eventId), eq(outbox.leaseToken, token)));
  }
  return true;
}

export async function searchPublishedDocumentation(
  teamId: string,
  query: string,
  k = 6,
) {
  const live = await readDocumentation(teamId);
  if (!live.indexing.enabled) return [];
  const tokens = [...new Set(query.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])];
  if (!tokens.length) return [];
  const origin = await siteOriginForTeam(teamId);
  const eligible = live.items.filter((i) => i.meta.indexable !== false);
  const scores =
    live.indexing.mode === "semantic"
      ? await semanticDocumentationScores(
          teamId,
          live.indexing.configHash,
          query,
          eligible,
        )
      : null;
  const candidates = eligible
    .flatMap((item) =>
      item._chunks.map((chunk, chunkIndex) => {
        const text =
          `${item.title} ${chunk.heading ?? ""} ${chunk.content}`.toLowerCase();
        const score = scores
          ? (scores.get(item.revisionId)?.[chunkIndex] ?? 0)
          : tokens.filter((token) => text.includes(token)).length / tokens.length;
        return {
          documentId: item.documentId,
          slug: item.slug,
          title: item.title,
          ...chunk,
          similarity: score,
          kind: "doc" as const,
          publicationId: live.publicationId,
          policyEpoch: live.policyEpoch,
          revisionId: item.revisionId,
          evidenceId: `${item.revisionId}:${chunkIndex}`,
          url: `${origin}/docs/${item.slug.split("/").map(encodeURIComponent).join("/")}${chunk.anchor ? `#${encodeURIComponent(chunk.anchor)}` : ""}`,
        };
      }),
    )
    .filter((c) => c.similarity > (scores ? 0.25 : 0))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, k);
  const final = await db.query.documentationSettings.findFirst({
    where: eq(settingsTable.teamId, teamId),
  });
  if (
    final?.policyEpoch !== live.policyEpoch ||
    final?.activePublicationId !== live.publicationId
  )
    return searchPublishedDocumentation(teamId, query, k);
  return candidates;
}

export async function documentationEvidenceAllowed(
  teamId: string,
  evidence: {
    documentId: string;
    kind?: string;
    revisionId?: string;
    publicationId?: string | null;
    policyEpoch?: number;
  }[],
) {
  const docs = evidence.filter((e) => e.kind === "doc" || !e.kind);
  if (!docs.length) return true;
  const live = await readDocumentation(teamId);
  return docs.every(
    (e) =>
      e.publicationId === live.publicationId &&
      e.policyEpoch === live.policyEpoch &&
      !!e.revisionId &&
      live.items.some(
        (i) => i.documentId === e.documentId && i.revisionId === e.revisionId,
      ),
  );
}
