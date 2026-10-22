import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, lte, or, sql } from "drizzle-orm";
import { DocsContentError, hashDocsContent } from "@frontlit/text-editor/docs";
import { db } from "../../db/client";
import { genPublicId } from "../../db/id";
import {
  documentationGitBindings as bindings,
  documentationGitJobs as jobs,
  documentationGitFiles as files,
  documentationSettings as settingsTable,
  documentationPublications as publications,
  documentationMemberships as memberships,
  documentationGitMigrations as migrations,
  documents,
  docSections,
  documentationGitProposals as proposals,
  documentationGitProposalDocuments as proposalLinks,
} from "../../db/schema";
import {
  includedGitProposals,
  sameProposalSource,
  type IncludedGitProposal,
} from "./proposal-application";
import { lockSettings } from "../authoring";
import { captureRevision, digest } from "../publications";
import { captureRetrievalConfiguration } from "../retrieval";
import { DocsGitHubApp, getDocsGitHubAppConfig, GitHubDocsError } from "./app";
import {
  importDocumentationTree,
  type DocumentationGitManifest,
  type GitTreeEntry,
} from "./importer";
import {
  activatePagesRelease,
  createPagesRelease,
  importPagesTree,
  revalidatePages,
  pagesSourceKey,
  PagesImportError,
  type PagesManifest,
} from "../../pages/git-import";
import { refreshPagePullRequests } from "../../pages/git-pr";
import { completeMergedPagesSetup } from "../../pages/git-export";
import { getTeamSettings } from "../../settings/queries";

import { cleanupGitHubDocumentation } from "./retention";
import { gitDocumentSnapshot, validateGitManifest } from "./source";
import {
  enqueueGitSync,
  markGitAccessLost,
  recoverGitAccess,
  readGitBindingAccess,
  type GitBinding,
} from "./state";

const LEASE_MS = 120_000;
type SyncJob = typeof jobs.$inferSelect;
export async function claimGitSync(teamId?: string) {
  const due = or(
    and(eq(jobs.status, "queued"), lte(jobs.nextAttemptAt, sql`now()`)),
    and(eq(jobs.status, "running"), lte(jobs.leaseExpiresAt, sql`now()`)),
  );
  const candidates = await db.query.documentationGitJobs.findMany({
    where: and(due, teamId ? eq(jobs.teamId, teamId) : undefined),
    orderBy: [asc(jobs.nextAttemptAt), asc(jobs.createdAt)],
    limit: 10,
  });
  for (const candidate of candidates) {
    const [claimed] = await db
      .update(jobs)
      .set({
        status: "running",
        attempts: candidate.attempts + 1,
        leaseToken: randomUUID(),
        leaseExpiresAt: new Date(Date.now() + LEASE_MS),
      })
      .where(and(eq(jobs.runId, candidate.runId), due))
      .returning();
    if (claimed) return claimed;
  }
  return null;
}
async function renew(job: SyncJob) {
  if (process.env.DOCS_RESTORE_PENDING === "true")
    throw new GitHubDocsError("RESTORE_PENDING", 409);
  const [renewed] = await db
    .update(jobs)
    .set({ leaseExpiresAt: new Date(Date.now() + LEASE_MS) })
    .where(
      and(
        eq(jobs.runId, job.runId),
        eq(jobs.status, "running"),
        eq(jobs.leaseToken, job.leaseToken!),
        sql`${jobs.leaseExpiresAt} > now()`,
      ),
    )
    .returning();
  if (!renewed) throw new GitHubDocsError("GITHUB_SUPERSEDED", 409);
}
function sameGeneration(binding: GitBinding | undefined, job: SyncJob) {
  return (
    binding?.status === "connected" &&
    binding.capabilities.read &&
    binding.generation === job.connectionGeneration &&
    binding.requestedGeneration === job.requestGeneration
  );
}
/** A reconcile at an already live commit needs no new import or embeddings. */
async function finishUnchangedSync(job: SyncJob, head: string) {
  return db.transaction(async (tx) => {
    const settings = await lockSettings(tx, job.teamId);
    const binding = await tx.query.documentationGitBindings.findFirst({
      where: eq(bindings.teamId, job.teamId),
    });
    const current = await tx.query.documentationGitJobs.findFirst({
      where: eq(jobs.runId, job.runId),
    });
    if (
      settings.source !== "git" ||
      !sameGeneration(binding, job) ||
      current?.status !== "running" ||
      current.leaseToken !== job.leaseToken ||
      !current.leaseExpiresAt ||
      current.leaseExpiresAt <= new Date()
    )
      throw new GitHubDocsError("GITHUB_SUPERSEDED", 409);
    if (binding!.liveSha !== head || !settings.activePublicationId) return null;
    const active = await tx.query.documentationPublications.findFirst({
      where: eq(publications.publicationId, settings.activePublicationId),
    });
    if (
      active?.status !== "active" ||
      active.purgeGeneration !== settings.purgeGeneration
    )
      return null;
    if (active.source === "git") {
      if (active.gitContext?.commitSha !== head) return null;
    } else {
      // Reviewed adoption preserves the original immutable editor publication.
      // Only its durable equivalence proof permits reuse as a Git base.
      const adopted = await tx.query.documentationGitMigrations.findFirst({
        where: and(
          eq(migrations.teamId, job.teamId),
          eq(migrations.status, "activated"),
          eq(migrations.activePublicationId, active.publicationId),
          eq(migrations.verifiedSha, head),
        ),
      });
      if (!adopted) return null;
    }
    const indexing = await captureRetrievalConfiguration(
      job.teamId,
      settings.indexing,
      tx,
    );
    const identity = (value: typeof indexing | typeof active.indexing) => [
      value.enabled,
      value.mode ?? "lexical",
      value.configHash ?? null,
    ];
    if (digest(identity(active.indexing)) !== digest(identity(indexing))) return null;
    await tx
      .update(bindings)
      .set({
        observedSha: head,
        validatedSha: head,
        lastSuccessfulSyncAt: new Date(),
        lastDiagnostic: null,
        updatedAt: new Date(),
      })
      .where(eq(bindings.teamId, job.teamId));
    const [done] = await tx
      .update(jobs)
      .set({
        status: "active",
        diagnostic: null,
        diagnosticReport: null,
        observedSha: head,
        publicationId: active.publicationId,
        leaseToken: null,
        leaseExpiresAt: null,
        finishedAt: new Date(),
      })
      .where(eq(jobs.runId, job.runId))
      .returning();
    return done;
  });
}
export async function authoringHash(snapshot: any) {
  return hashDocsContent({
    content: snapshot.draftContent,
    metadata: {
      title: snapshot.draftTitle,
      slug: snapshot.draftSlug,
      description: snapshot.draftExcerpt,
      ...snapshot.draftMeta,
    },
    embeddingConfigurationVersion: "authoring-v1",
  });
}

/** Import storage and immutable candidate admission commit together. Drafts are not the Git publication input. */
export async function captureGitManifest(
  job: SyncJob,
  manifest: DocumentationGitManifest,
  included: IncludedGitProposal[] = [],
  docsTreeSha?: string,
  /** Pages from the same commit: their release is created with the docs
   * publication, so it exists before that publication can activate. */
  pages?: PagesManifest | null,
) {
  const teamSettings = pages ? await getTeamSettings(job.teamId) : undefined;
  return db.transaction(async (tx) => {
    const settings = await lockSettings(tx, job.teamId);
    if (process.env.DOCS_RESTORE_PENDING === "true")
      throw new GitHubDocsError("RESTORE_PENDING", 409);
    const binding = await tx.query.documentationGitBindings.findFirst({
      where: eq(bindings.teamId, job.teamId),
    });
    const current = await tx.query.documentationGitJobs.findFirst({
      where: eq(jobs.runId, job.runId),
    });
    if (
      !sameGeneration(binding, job) ||
      settings.source !== "git" ||
      current?.status !== "running" ||
      current.leaseToken !== job.leaseToken ||
      !current.leaseExpiresAt ||
      current.leaseExpiresAt <= new Date()
    )
      throw new GitHubDocsError("GITHUB_SUPERSEDED", 409);
    const previousFiles = await tx.query.documentationGitFiles.findMany({
      where: eq(files.teamId, job.teamId),
    });
    const previousDocs = await tx.query.documents.findMany({
      where: and(eq(documents.teamId, job.teamId), eq(documents.kind, "doc")),
    });
    const previousSections = await tx.query.docSections.findMany({
      where: eq(docSections.teamId, job.teamId),
    });
    const accepted = included.length
      ? await tx.query.documentationGitProposals.findMany({
          where: and(
            eq(proposals.teamId, job.teamId),
            inArray(
              proposals.proposalId,
              included.map((p) => p.proposalId),
            ),
          ),
        })
      : [];
    const proven = accepted.filter(
      (p) =>
        ["merged", "canceled"].includes(p.status) &&
        sameProposalSource(p, binding!) &&
        included.some(
          (proof) =>
            proof.proposalId === p.proposalId &&
            proof.mergedCommitSha === p.mergedCommitSha,
        ),
    );
    const selected = proven.length
      ? await tx.query.documentationGitProposalDocuments.findMany({
          where: and(
            eq(proposalLinks.teamId, job.teamId),
            inArray(
              proposalLinks.proposalId,
              proven.map((p) => p.proposalId),
            ),
          ),
        })
      : [];
    const targetIdentities = new Map<string, (typeof selected)[number]>();
    for (const link of selected) {
      if (
        !link.targetPath ||
        !manifest.docs.some((doc) => doc.sourcePath === link.targetPath)
      )
        continue;
      const occupied = previousFiles.find(
        (file) => file.sourcePath === link.targetPath,
      );
      if (
        (occupied && occupied.documentId !== link.documentId) ||
        targetIdentities.has(link.targetPath) ||
        (link.sourcePath &&
          link.sourcePath !== link.targetPath &&
          manifest.docs.some((doc) => doc.sourcePath === link.sourcePath))
      )
        throw new GitHubDocsError("GITHUB_PROPOSAL_IDENTITY_CONFLICT", 409);
      targetIdentities.set(link.targetPath, link);
    }
    const candidateIdentities = new Set<string>();
    for (const doc of manifest.docs) {
      const id =
        targetIdentities.get(doc.sourcePath)?.documentId ??
        previousFiles.find((file) => file.sourcePath === doc.sourcePath)?.documentId;
      if (!id) continue;
      if (candidateIdentities.has(id))
        throw new GitHubDocsError("GITHUB_PROPOSAL_IDENTITY_CONFLICT", 409);
      candidateIdentities.add(id);
    }
    const navigation: {
      sectionId: string;
      name: string;
      slug: string;
      order: number;
    }[] = [];
    for (const section of manifest.sections) {
      const existing = previousSections.find((s) => s.slug === section.folder);
      const values = {
        teamId: job.teamId,
        name: section.name,
        slug: section.folder,
        order: section.order,
        updatedAt: new Date(),
      };
      const [row] = existing
        ? await tx
            .update(docSections)
            .set(values)
            .where(eq(docSections.sectionId, existing.sectionId))
            .returning()
        : await tx.insert(docSections).values(values).returning();
      navigation.push({
        sectionId: row.sectionId,
        name: row.name,
        slug: row.slug,
        order: row.order,
      });
    }
    const generation = settings.requestedGeneration + 1;
    const [publication] = await tx
      .insert(publications)
      .values({
        teamId: job.teamId,
        source: "git",
        admissionType: "automatic",
        idempotencyKey: `git-sync/${job.runId}`,
        inputHash: digest({
          manifest,
          generation: job.connectionGeneration,
          request: job.requestGeneration,
        }),
        basePublicationId: settings.activePublicationId,
        generation,
        purgeGeneration: settings.purgeGeneration,
        docsDraftVersion: settings.draftVersion + 1,
        navigation,
        indexing: await captureRetrievalConfiguration(
          job.teamId,
          settings.indexing,
          tx as any,
        ),
        gitContext: {
          installationId: binding!.installationId,
          repositoryId: binding!.repositoryId,
          ownerId: binding!.ownerId,
          connectionGeneration: job.connectionGeneration,
          requestGeneration: job.requestGeneration,
          commitSha: manifest.commitSha,
          runId: job.runId,
          proposalIds: proven
            .filter((p) => p.status === "merged")
            .map((p) => p.proposalId),
          ...(docsTreeSha ? { docsTreeSha } : {}),
        },
      })
      .returning();
    for (const doc of manifest.docs) {
      const applied = targetIdentities.get(doc.sourcePath);
      const previous = previousFiles.find(
        (f) => f.sourcePath === (applied?.sourcePath ?? doc.sourcePath),
      );
      const documentId =
        applied?.documentId ?? previous?.documentId ?? genPublicId("doc");
      // Historical paths remain identity tombstones. Only the new path may be
      // the active mapping for this document during an atomic recognized move.
      if (applied?.sourcePath && applied.sourcePath !== doc.sourcePath) {
        await tx
          .update(files)
          .set({ removedAt: new Date(), commitSha: manifest.commitSha })
          .where(
            and(eq(files.teamId, job.teamId), eq(files.sourcePath, applied.sourcePath)),
          );
      }
      const existing = previousDocs.find((d) => d.documentId === documentId);
      const sectionId =
        navigation.find((s) => s.slug === doc.sectionSlug)?.sectionId ?? null;
      const snapshot = gitDocumentSnapshot(
        doc,
        documentId,
        sectionId,
        existing?.draftVersion ?? 1,
      );
      const draftHash = await authoringHash(snapshot);
      const draftGitSource = {
        sourcePath: doc.sourcePath,
        base: {
          commitSha: manifest.commitSha,
          sourcePath: doc.sourcePath,
          sourceHash: doc.sourceHash,
        },
      };
      // The separate imported snapshot is always updated; a newer local proposal is preserved.
      const clean =
        !existing ||
        (applied
          ? existing.draftVersion === applied.draftVersion
          : ((!!previous && existing.draftHash === previous.snapshot.draftHash) ||
              existing.draftHash === draftHash) &&
            (!existing.draftGitSource ||
              existing.draftGitSource.sourcePath === doc.sourcePath));
      if (!existing) {
        await tx.insert(documents).values({
          teamId: job.teamId,
          documentId,
          kind: "doc",
          slug: doc.slug,
          ...(snapshot as any),
          draftHash,
          draftMarkdown: doc.markdown,
          draftGitSource,
        });
      } else if (clean && existing.draftHash !== draftHash) {
        snapshot.draftVersion = existing.draftVersion + 1;
        await tx
          .update(documents)
          .set({
            ...(snapshot as any),
            draftHash,
            draftMarkdown: doc.markdown,
            draftGitSource,
            updatedAt: new Date(),
          })
          .where(eq(documents.documentId, documentId));
      } else if (clean) {
        await tx
          .update(documents)
          .set({ draftGitSource })
          .where(eq(documents.documentId, documentId));
      }
      // An imported accepted revision must not pretend an unrelated dirty draft was published.
      if (!clean) snapshot.draftVersion = applied?.draftVersion ?? 0;
      await tx
        .insert(files)
        .values({
          teamId: job.teamId,
          sourcePath: doc.sourcePath,
          documentId,
          commitSha: manifest.commitSha,
          blobSha: doc.blobSha,
          sourceHash: doc.sourceHash,
          markdown: doc.markdown,
          frontmatter: doc.frontmatter,
          snapshot: { ...snapshot, draftHash },
          removedAt: null,
        })
        .onConflictDoUpdate({
          target: [files.teamId, files.sourcePath],
          set: {
            commitSha: manifest.commitSha,
            blobSha: doc.blobSha,
            sourceHash: doc.sourceHash,
            markdown: doc.markdown,
            frontmatter: doc.frontmatter,
            snapshot: { ...snapshot, draftHash },
            removedAt: null,
          },
        });
      const revision = await captureRevision(tx as any, {
        ...snapshot,
        teamId: job.teamId,
      });
      if (doc.published) {
        await tx.insert(memberships).values({
          publicationId: publication.publicationId,
          documentId,
          revisionId: revision.revisionId,
          route: doc.slug,
        });
      }
    }
    const removed = previousFiles.filter(
      (f) => !manifest.docs.some((d) => d.sourcePath === f.sourcePath),
    );
    for (const file of removed)
      await tx
        .update(files)
        .set({ removedAt: new Date(), commitSha: manifest.commitSha })
        .where(
          and(eq(files.teamId, job.teamId), eq(files.sourcePath, file.sourcePath)),
        );
    await tx
      .update(settingsTable)
      .set({ requestedGeneration: generation, draftVersion: settings.draftVersion + 1 })
      .where(eq(settingsTable.teamId, job.teamId));
    await tx
      .update(bindings)
      .set({
        observedSha: manifest.commitSha,
        validatedSha: manifest.commitSha,
        lastDiagnostic: null,
      })
      .where(eq(bindings.teamId, job.teamId));
    const [updated] = await tx
      .update(jobs)
      .set({
        status: "preparing",
        diagnostic: null,
        diagnosticReport: null,
        observedSha: manifest.commitSha,
        publicationId: publication.publicationId,
        leaseToken: null,
        leaseExpiresAt: null,
      })
      .where(eq(jobs.runId, job.runId))
      .returning();
    if (pages)
      await createPagesRelease(job.teamId, pages, {
        docsPublicationId: publication.publicationId,
        executor: tx,
        settings: teamSettings,
      });
    return updated;
  });
}
export async function processGitSync(teamId?: string, injectedApp?: DocsGitHubApp) {
  if (process.env.DOCS_RESTORE_PENDING === "true") return null;
  const job = await claimGitSync(teamId);
  if (!job) return null;
  const reportFence = await db.transaction((tx) => lockSettings(tx, job.teamId));
  try {
    const binding = await db.query.documentationGitBindings.findFirst({
      where: eq(bindings.teamId, job.teamId),
    });
    if (!sameGeneration(binding, job))
      throw new GitHubDocsError("GITHUB_SUPERSEDED", 409);
    const app = injectedApp ?? new DocsGitHubApp(getDocsGitHubAppConfig());
    const access = await readGitBindingAccess(binding!, app);
    const head = await app.branchHead(
      access.token,
      access.repository.owner.login,
      access.repository.name,
      binding!.branch,
    );
    // Preserve the immutable attempted commit even when tree/content validation
    // fails before a publication exists. Publication feedback must identify the
    // failed commit separately from the last successfully served commit.
    const [observed] = await db
      .update(jobs)
      .set({ observedSha: head })
      .where(
        and(
          eq(jobs.runId, job.runId),
          eq(jobs.status, "running"),
          eq(jobs.leaseToken, job.leaseToken!),
          sql`${jobs.leaseExpiresAt} > now()`,
        ),
      )
      .returning({ runId: jobs.runId });
    if (!observed) throw new GitHubDocsError("GITHUB_SUPERSEDED", 409);
    if (job.reviewedSha && job.reviewedSha !== head) {
      await enqueueGitSync(job.teamId, {
        expectedGeneration: job.connectionGeneration,
        expectedRequestGeneration: job.requestGeneration,
      });
      return db.query.documentationGitJobs.findFirst({
        where: eq(jobs.runId, job.runId),
      });
    }
    // One tree read serves every source of this commit.
    let tree: GitTreeEntry[] | null = null;
    const readTree = async () => {
      await renew(job);
      tree ??= await app.commitTree(
        access.token,
        access.repository.owner.login,
        access.repository.name,
        head,
      );
      return tree;
    };
    const readBlob = async (sha: string) => {
      await renew(job);
      return app.blob(
        access.token,
        access.repository.owner.login,
        access.repository.name,
        sha,
      );
    };
    // A merged pages setup PR turns pages sync on in this same sync.
    const source = binding!.pagesDirectory
      ? binding!
      : await completeMergedPagesSetup(binding!, app);
    const pages = source.pagesDirectory
      ? await importChangedPages(job.teamId, source, head, await readTree(), readBlob)
      : null;
    if (source.pagesDirectory) await refreshPagePullRequests(source, app);
    if (!binding!.docsEnabled)
      return await finishWithoutDocsPublication(job, head, pages);
    const included = await includedGitProposals(binding!, head, app, access, () =>
      renew(job),
    );
    const unchanged = included.some((proposal) => proposal.apply)
      ? null
      : await finishUnchangedSync(job, head);
    if (unchanged) {
      if (pages)
        await activatePagesRelease(
          job.teamId,
          await createPagesRelease(job.teamId, pages),
        );
      return unchanged;
    }
    // A new commit that leaves the docs folder untouched (e.g. a monorepo
    // push elsewhere) publishes no docs; pages still go live if they changed.
    const docsTreeSha = (await readTree()).find(
      (entry) => entry.path === binding!.directory && entry.type === "tree",
    )?.sha;
    if (
      binding!.liveSha !== head &&
      docsTreeSha &&
      docsTreeSha === binding!.docsSourceKey &&
      !included.some((proposal) => proposal.apply)
    )
      return await finishWithoutDocsPublication(job, head, pages);
    await db
      .update(bindings)
      .set({ observedSha: head })
      .where(
        and(
          eq(bindings.teamId, job.teamId),
          eq(bindings.generation, job.connectionGeneration),
        ),
      );
    const previous = await db.query.documentationGitFiles.findFirst({
      where: eq(files.teamId, job.teamId),
    });
    const manifest = await importDocumentationTree({
      commitSha: head,
      directory: binding!.directory,
      entries: await readTree(),
      previouslyPopulated: !!previous,
      readBlob,
    });
    await renew(job);
    const report = await validateGitManifest(job.teamId, manifest);
    if (!report.publishable) throw new DocsContentError(report.diagnostics);
    // Pages from the same commit go live with this docs publication
    // (`activateGitRelease`), or not at all if it fails.
    return await captureGitManifest(job, manifest, included, docsTreeSha, pages);
  } catch (caught) {
    const error =
      caught instanceof PagesImportError
        ? new DocsContentError(caught.diagnostics)
        : caught;
    if (caught instanceof PagesImportError)
      await db
        .update(bindings)
        .set({ pagesDiagnostics: caught.diagnostics as any })
        .where(eq(bindings.teamId, job.teamId));
    const code =
      error instanceof GitHubDocsError
        ? error.code
        : error instanceof DocsContentError
          ? (error.diagnostics[0]?.code ?? "INVALID_DOCUMENT")
          : "GITHUB_UNAVAILABLE";
    if (["GITHUB_ACCESS_LOST", "GITHUB_OWNER_CHANGED"].includes(code))
      await markGitAccessLost(job.teamId, job.connectionGeneration, code);
    const limited = code === "GITHUB_RATE_LIMITED";
    const restoring = code === "RESTORE_PENDING";
    const retry =
      restoring || limited || (code === "GITHUB_UNAVAILABLE" && job.attempts < 5);
    const nextAttemptAt = new Date(
      Math.max(
        error instanceof GitHubDocsError ? (error.retryAt?.getTime() ?? 0) : 0,
        Date.now() + Math.min(300000, 5000 * 2 ** (job.attempts - 1)),
      ),
    );
    const failed = await db.transaction(async (tx) => {
      const settings = await lockSettings(tx, job.teamId);
      const [settled] = await tx
        .update(jobs)
        .set({
          status:
            code === "GITHUB_SUPERSEDED" ? "superseded" : retry ? "queued" : "failed",
          diagnostic: code,
          diagnosticReport:
            error instanceof DocsContentError &&
            settings.policyEpoch === reportFence.policyEpoch &&
            settings.purgeGeneration === reportFence.purgeGeneration
              ? {
                  diagnostics: error.diagnostics,
                  policyEpoch: reportFence.policyEpoch,
                  purgeGeneration: reportFence.purgeGeneration,
                }
              : null,
          leaseToken: null,
          leaseExpiresAt: null,
          nextAttemptAt,
          ...(limited || restoring ? { attempts: job.attempts - 1 } : {}),
          finishedAt: retry ? null : new Date(),
        })
        .where(
          and(
            eq(jobs.runId, job.runId),
            eq(jobs.status, "running"),
            eq(jobs.leaseToken, job.leaseToken!),
            sql`${jobs.leaseExpiresAt} > now()`,
          ),
        )
        .returning();
      if (settled)
        await tx
          .update(bindings)
          .set({ lastDiagnostic: code })
          .where(
            and(
              eq(bindings.teamId, job.teamId),
              eq(bindings.generation, job.connectionGeneration),
              eq(bindings.requestedGeneration, job.requestGeneration),
            ),
          );
      return settled;
    });
    return (
      failed ??
      db.query.documentationGitJobs.findFirst({ where: eq(jobs.runId, job.runId) })
    );
  }
}
/** Imports the pages source when its tree (or site.json) changed since the
 * last activated pages release; null when there's nothing new. */
async function importChangedPages(
  teamId: string,
  binding: GitBinding,
  head: string,
  entries: GitTreeEntry[],
  readBlob: (sha: string) => Promise<Uint8Array>,
): Promise<PagesManifest | null> {
  const key = pagesSourceKey(entries, binding.pagesDirectory!);
  if (key && key === binding.pagesSourceKey) return null;
  const manifest = await importPagesTree({
    teamId,
    commitSha: head,
    directory: binding.pagesDirectory!,
    entries,
    readBlob,
  });
  await db
    .update(bindings)
    .set({ pagesDiagnostics: manifest.diagnostics as any })
    .where(eq(bindings.teamId, teamId));
  return manifest;
}

/** Finishes a sync that publishes no docs (docs off, or the docs folder is
 * unchanged), activating the pages release when pages changed. */
async function finishWithoutDocsPublication(
  job: SyncJob,
  head: string,
  pages: PagesManifest | null,
) {
  const teamSettings = pages ? await getTeamSettings(job.teamId) : undefined;
  let activated = false;
  const done = await db.transaction(async (tx) => {
    await lockSettings(tx, job.teamId);
    const binding = await tx.query.documentationGitBindings.findFirst({
      where: eq(bindings.teamId, job.teamId),
    });
    const current = await tx.query.documentationGitJobs.findFirst({
      where: eq(jobs.runId, job.runId),
    });
    if (
      !sameGeneration(binding, job) ||
      current?.status !== "running" ||
      current.leaseToken !== job.leaseToken
    )
      throw new GitHubDocsError("GITHUB_SUPERSEDED", 409);
    if (pages) {
      // Created only after the lease check, so a superseded job writes nothing.
      const release = await createPagesRelease(job.teamId, pages, {
        executor: tx,
        settings: teamSettings,
      });
      await activatePagesRelease(job.teamId, release, tx);
      activated = true;
    }
    await tx
      .update(bindings)
      .set({
        observedSha: head,
        validatedSha: head,
        liveSha: head,
        lastSuccessfulSyncAt: new Date(),
        lastDiagnostic: null,
        updatedAt: new Date(),
      })
      .where(eq(bindings.teamId, job.teamId));
    const [row] = await tx
      .update(jobs)
      .set({
        status: "active",
        diagnostic: null,
        diagnosticReport: null,
        observedSha: head,
        leaseToken: null,
        leaseExpiresAt: null,
        finishedAt: new Date(),
      })
      .where(eq(jobs.runId, job.runId))
      .returning();
    return row;
  });
  if (activated) await revalidatePages(job.teamId);
  return done;
}

export async function reconcileGitSources(now = new Date()) {
  const due = await db.query.documentationGitBindings.findMany({
    where: and(
      inArray(bindings.status, ["connected", "access_lost"]),
      lte(bindings.nextReconcileAt, now),
    ),
    limit: 5,
  });
  for (const binding of due) {
    if (binding.status === "access_lost") {
      await recoverGitAccess(binding);
      continue;
    }
    const pending = await db.query.documentationGitJobs.findFirst({
      where: and(
        eq(jobs.teamId, binding.teamId),
        inArray(jobs.status, ["queued", "running", "preparing"]),
      ),
    });
    if (pending) {
      await db
        .update(bindings)
        .set({ nextReconcileAt: new Date(now.getTime() + 15 * 60_000) })
        .where(
          and(
            eq(bindings.teamId, binding.teamId),
            eq(bindings.generation, binding.generation),
          ),
        );
      continue;
    }
    await enqueueGitSync(binding.teamId, {
      expectedGeneration: binding.generation,
      expectedRequestGeneration: binding.requestedGeneration,
    });
  }
  await cleanupGitHubDocumentation(now);
}
