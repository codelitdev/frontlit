import { and, desc, eq, gt, inArray } from "drizzle-orm";
import {
  DocsContentError,
  normalizeDocsSourceDirectory,
  sortDiagnostics,
  type DocsDiagnostic,
} from "@frontlit/text-editor/docs";
import type { AuthzContext } from "../../auth/authorize";
import { db } from "../../db/client";
import {
  documents,
  docSections,
  documentationGitBindings as bindings,
  documentationGitPreflights as preflights,
  documentationGitSetups as setups,
  documentationGitJobs as jobs,
  documentationGitMigrations as migrations,
  documentationSettings as settingsTable,
  documentationPublications as publications,
  documentationMemberships as memberships,
} from "../../db/schema";
import { serializeDates } from "../../utils/public";
import { draftReport, getDocsSettings, lockSettings } from "../authoring";
import { digest } from "../publications";
import { DocsGitHubApp, getDocsGitHubAppConfig, GitHubDocsError } from "./app";
import { importDocumentationTree, type DocumentationGitManifest } from "./importer";
import { authorizedSetup, requireGitManager, verifySetupRepository } from "./setup";
import { latestPagesSetup } from "../../pages/git-export";
import { enqueueGitSync, readGitBindingAccess, supersedeGitWork } from "./state";
import { reserveGitValidation } from "./admission";

export type GitSourceSelection = {
  setupId: string;
  installationId: number;
  repositoryId: number;
  branch: string;
  directory: string;
  docsEnabled?: boolean;
};
export function gitDocumentSnapshot(
  doc: DocumentationGitManifest["docs"][number],
  documentId: string,
  sectionId: string | null,
  draftVersion = 1,
) {
  return {
    documentId,
    draftVersion,
    draftTitle: doc.title,
    draftSlug: doc.slug,
    draftContent: doc.content,
    draftExcerpt: doc.description,
    draftFeaturedImage: doc.frontmatter.featured_image ?? null,
    draftMeta: {
      sectionId,
      order: doc.navOrder,
      indexable: doc.indexable,
      frontmatter: doc.frontmatter,
    },
  };
}
export async function validateGitManifest(
  teamId: string,
  manifest: DocumentationGitManifest,
) {
  const sections = manifest.sections.map((s) => ({
    sectionId: s.folder,
    slug: s.folder,
    name: s.name,
    order: s.order,
  }));
  const candidates = manifest.docs
    .filter((d) => d.published)
    .map((d) => gitDocumentSnapshot(d, d.sourcePath, d.sectionSlug));
  const diagnostics: DocsDiagnostic[] = [];
  for (const candidate of candidates) {
    const report = await draftReport(teamId, candidate, {
      candidates,
      documentId: candidate.documentId,
      sections,
    });
    diagnostics.push(
      ...report.diagnostics.map((d) => ({
        ...d,
        file: candidate.documentId,
        documentId: undefined,
      })),
    );
  }
  return {
    publishable: !diagnostics.some((d) => d.blocksPublish),
    diagnostics: sortDiagnostics(diagnostics),
  };
}
export function preflightProjection(
  row: typeof preflights.$inferSelect,
  diagnostics: DocsDiagnostic[] = [],
) {
  const manifest = row.manifest;
  if (!manifest || !row.commitSha)
    throw new GitHubDocsError("GITHUB_PREFLIGHT_EXPIRED", 409);
  return serializeDates({
    preflightId: row.preflightId,
    setupId: row.setupId,
    commitSha: row.commitSha,
    docsDraftVersion: row.docsDraftVersion,
    manifestHash: row.manifestHash,
    expiresAt: row.expiresAt,
    repositoryId: row.repositoryId,
    repositoryPrivate: row.repositoryPrivate,
    branch: row.branch,
    directory: row.directory,
    fileCount: manifest.docs.length,
    publishedCount: manifest.docs.filter((d) => d.published).length,
    excludedFiles: manifest.docs.filter((d) => !d.published).map((d) => d.sourcePath),
    sections: manifest.sections,
    routes: manifest.docs
      .filter((d) => d.published)
      .map((d) => ({ path: d.sourcePath, route: d.route })),
    publishedDefaultsToTrue: true,
    selectedDocsWillBePublic: true,
    publishable: true,
    diagnostics,
  });
}
export async function preflightGitHubSource(
  teamId: string,
  actor: AuthzContext,
  input: GitSourceSelection,
  config = getDocsGitHubAppConfig(),
  app = new DocsGitHubApp(config),
) {
  requireGitManager(teamId, actor);
  await reserveGitValidation(teamId, actor);
  const directory = normalizeDocsSourceDirectory(input.directory);
  const access = await verifySetupRepository(
    teamId,
    input.setupId,
    actor,
    input,
    config,
    app,
  );
  const settings = await getDocsSettings(teamId);
  const sha = await app.branchHead(
    access.installationToken,
    access.repository.owner.login,
    access.repository.name,
    input.branch,
  );
  try {
    // A pages-only connection imports no docs; pages are previewed and
    // turned on from the connected source.
    const manifest =
      input.docsEnabled === false
        ? {
            commitSha: sha,
            directory,
            docs: [],
            sections: [],
            bytes: 0,
            docsEnabled: false,
          }
        : await importDocumentationTree({
            commitSha: sha,
            directory,
            entries: await app.commitTree(
              access.installationToken,
              access.repository.owner.login,
              access.repository.name,
              sha,
            ),
            readBlob: (id) =>
              app.blob(
                access.installationToken,
                access.repository.owner.login,
                access.repository.name,
                id,
              ),
          });
    const report =
      input.docsEnabled === false
        ? { publishable: true, diagnostics: [] }
        : await validateGitManifest(teamId, manifest as DocumentationGitManifest);
    if (!report.publishable) return { preflightId: null, commitSha: sha, ...report };
    if (access.setup.expiresAt <= new Date())
      throw new GitHubDocsError("GITHUB_SETUP_EXPIRED", 409);
    const [row] = await db
      .insert(preflights)
      .values({
        teamId,
        setupId: input.setupId,
        installationId: String(input.installationId),
        repositoryId: String(input.repositoryId),
        ownerId: String(access.repository.owner.id),
        ownerLogin: access.repository.owner.login,
        repositoryName: access.repository.name,
        repositoryPrivate: access.repository.private,
        branch: input.branch,
        directory,
        commitSha: sha,
        docsDraftVersion: settings.draftVersion,
        manifestHash: digest(manifest),
        manifest: manifest as DocumentationGitManifest,
        expiresAt: access.setup.expiresAt,
      })
      .returning();
    return preflightProjection(row, report.diagnostics);
  } catch (error) {
    if (error instanceof DocsContentError)
      return {
        preflightId: null,
        commitSha: sha,
        publishable: false,
        diagnostics: error.diagnostics,
      };
    throw error;
  }
}

export async function connectGitHubSource(
  teamId: string,
  actor: AuthzContext,
  input: {
    preflightId: string;
    commitSha: string;
    manifestHash: string;
    expectedDocsDraftVersion: number;
    idempotencyKey: string;
    consent: {
      publishSelectedDocsPublicly: true;
      automaticallyPublishFuturePushes: true;
      delegateToWorkspacePublishers: true;
    };
  },
  config = getDocsGitHubAppConfig(),
  app = new DocsGitHubApp(config),
) {
  requireGitManager(teamId, actor, true, true);
  if (
    !input.consent?.publishSelectedDocsPublicly ||
    !input.consent.automaticallyPublishFuturePushes ||
    !input.consent.delegateToWorkspacePublishers
  )
    throw new GitHubDocsError("GITHUB_PUBLICATION_CONSENT_REQUIRED", 400);
  const inputHash = digest(input);
  const existing = await db.query.documentationGitBindings.findFirst({
    where: eq(bindings.teamId, teamId),
  });
  if (existing?.connectionReceipt?.key === input.idempotencyKey) {
    if (
      existing.connectionReceipt.inputHash !== inputHash ||
      existing.connectionReceipt.actorAccountId !== actor.accountId
    )
      throw new GitHubDocsError("IDEMPOTENCY_CONFLICT", 409);
    return getGitHubSource(teamId);
  }
  const preflight = await db.query.documentationGitPreflights.findFirst({
    where: and(
      eq(preflights.teamId, teamId),
      eq(preflights.preflightId, input.preflightId),
    ),
  });
  if (
    !preflight ||
    !preflight.commitSha ||
    !preflight.manifest ||
    preflight.expiresAt <= new Date() ||
    preflight.commitSha !== input.commitSha ||
    preflight.manifestHash !== input.manifestHash
  )
    throw new GitHubDocsError("GITHUB_PREFLIGHT_EXPIRED", 409);
  const verified = await verifySetupRepository(
    teamId,
    preflight.setupId,
    actor,
    {
      installationId: Number(preflight.installationId),
      repositoryId: Number(preflight.repositoryId),
    },
    config,
    app,
  );
  if (String(verified.repository.owner.id) !== preflight.ownerId)
    throw new GitHubDocsError("GITHUB_OWNER_CHANGED", 409);
  await db.transaction(async (tx) => {
    const settings = await lockSettings(tx, teamId);
    const setup = await authorizedSetup(teamId, preflight.setupId, actor, tx);
    const binding = await tx.query.documentationGitBindings.findFirst({
      where: eq(bindings.teamId, teamId),
    });
    if (binding?.connectionReceipt?.key === input.idempotencyKey) {
      if (
        binding.connectionReceipt.inputHash !== inputHash ||
        binding.connectionReceipt.actorAccountId !== actor.accountId
      )
        throw new GitHubDocsError("IDEMPOTENCY_CONFLICT", 409);
      return;
    }
    if (
      settings.draftVersion !== input.expectedDocsDraftVersion ||
      preflight.docsDraftVersion !== settings.draftVersion
    )
      throw new GitHubDocsError("STALE_DOCS_DRAFT", 409);
    const pending = await tx.query.documentationPublications.findFirst({
      where: and(
        eq(publications.teamId, teamId),
        inArray(publications.status, ["queued", "preparing", "prepared"]),
      ),
    });
    if (pending) throw new GitHubDocsError("PUBLICATION_PENDING", 409);
    const docsEnabled =
      (preflight.manifest as { docsEnabled?: boolean }).docsEnabled !== false;
    if (!docsEnabled) {
      // Pages only: docs stay wherever they are.
    } else if (settings.source === "editor") {
      const docs = await tx.query.documents.findFirst({
        where: and(eq(documents.teamId, teamId), eq(documents.kind, "doc")),
      });
      const section = await tx.query.docSections.findFirst({
        where: eq(docSections.teamId, teamId),
      });
      const liveMember = settings.activePublicationId
        ? await tx.query.documentationMemberships.findFirst({
            where: eq(memberships.publicationId, settings.activePublicationId),
          })
        : null;
      if (docs || section || liveMember)
        throw new GitHubDocsError("SOURCE_MIGRATION_REQUIRED", 409);
    } else if (
      !binding ||
      binding.repositoryId !== preflight.repositoryId ||
      binding.ownerId !== preflight.ownerId ||
      binding.branch !== preflight.branch ||
      binding.directory !== preflight.directory ||
      setup.purpose !== "reconnect"
    ) {
      throw new GitHubDocsError("SOURCE_MIGRATION_REQUIRED", 409);
    }
    const value = {
      teamId,
      installationId: preflight.installationId,
      repositoryId: preflight.repositoryId,
      ownerId: preflight.ownerId,
      ownerLogin: verified.repository.owner.login,
      repositoryName: verified.repository.name,
      repositoryPrivate: verified.repository.private,
      branch: preflight.branch,
      directory: preflight.directory,
      status: "connected" as const,
      generation: (binding?.generation ?? 0) + 1,
      requestedGeneration: binding?.requestedGeneration ?? 0,
      grantVersion: (binding?.grantVersion ?? 0) + 1,
      grantActorAccountId: actor.accountId!,
      grantGithubUserId: setup.githubUserId!,
      repositoryAdminVerified: true,
      capabilities: { read: true, proposals: false, directCommit: false },
      grantedAt: new Date(),
      lastDiagnostic: null,
      docsEnabled,
      updatedAt: new Date(),
    };
    await tx
      .insert(bindings)
      .values(value)
      .onConflictDoUpdate({ target: bindings.teamId, set: value });
    if (docsEnabled)
      await tx
        .update(settingsTable)
        .set({ source: "git", draftVersion: settings.draftVersion + 1 })
        .where(eq(settingsTable.teamId, teamId));
    // A pages-only connection has nothing to sync until pages are turned on.
    const run =
      docsEnabled || binding?.pagesDirectory
        ? await enqueueGitSync(
            teamId,
            { reviewedSha: input.commitSha, trigger: "connect" },
            tx,
          )
        : { runId: "none" };
    await tx
      .update(bindings)
      .set({
        connectionReceipt: {
          actorAccountId: actor.accountId!,
          inputHash,
          key: input.idempotencyKey,
          runId: run.runId,
        },
      })
      .where(eq(bindings.teamId, teamId));
    const [consumed] = await tx
      .update(setups)
      .set({ status: "consumed", encryptedVerifier: null, encryptedUserToken: null })
      .where(and(eq(setups.setupId, setup.setupId), eq(setups.status, "authorized")))
      .returning();
    if (!consumed || setup.expiresAt <= new Date())
      throw new GitHubDocsError("GITHUB_SETUP_EXPIRED", 409);
  });
  return getGitHubSource(teamId);
}

export async function getGitHubSource(teamId: string, actor?: AuthzContext) {
  const settings = await getDocsSettings(teamId);
  const binding = await db.query.documentationGitBindings.findFirst({
    where: eq(bindings.teamId, teamId),
  });
  let configured = true;
  try {
    getDocsGitHubAppConfig();
  } catch {
    configured = false;
  }
  if (!binding) {
    let pendingMigrationId: string | null = null;
    if (actor && settings.source === "editor") {
      let canManage = false;
      try {
        requireGitManager(teamId, actor);
        canManage = true;
      } catch (error) {
        if (
          !(error instanceof GitHubDocsError) ||
          error.code !== "GITHUB_USER_AUTH_REQUIRED"
        )
          throw error;
      }
      if (canManage) {
        const [plan] = await db
          .select({ planId: migrations.planId })
          .from(migrations)
          .where(
            and(
              eq(migrations.teamId, teamId),
              eq(migrations.actorAccountId, actor.accountId!),
              inArray(migrations.status, ["planned", "verified"]),
              gt(migrations.expiresAt, new Date()),
            ),
          )
          .orderBy(desc(migrations.createdAt), desc(migrations.planId))
          .limit(1);
        pendingMigrationId = plan?.planId ?? null;
      }
    }
    return {
      configured,
      ...(actor ? { pendingMigrationId } : {}),
      source: settings.source,
      status: "unconfigured",
      binding: null,
      sync: null,
    };
  }
  const run = await db.query.documentationGitJobs.findFirst({
    where: eq(jobs.teamId, teamId),
    orderBy: [desc(jobs.createdAt), desc(jobs.runId)],
  });
  const publication = run?.publicationId
    ? await db.query.documentationPublications.findFirst({
        where: eq(publications.publicationId, run.publicationId),
      })
    : null;
  const report = run?.diagnosticReport;
  const diagnostics =
    publication && publication.purgeGeneration === settings.purgeGeneration
      ? publication.diagnostics
      : report?.policyEpoch === settings.policyEpoch &&
          report?.purgeGeneration === settings.purgeGeneration
        ? report.diagnostics
        : [];
  return serializeDates({
    configured,
    ...(actor ? { pendingMigrationId: null } : {}),
    source: settings.source,
    status: binding.status,
    binding: {
      repositoryId: binding.repositoryId,
      owner: binding.ownerLogin,
      repository: binding.repositoryName,
      private: binding.repositoryPrivate,
      branch: binding.branch,
      directory: binding.directory,
      generation: binding.generation,
      grantVersion: binding.grantVersion,
      capabilities: binding.capabilities,
      observedSha: binding.observedSha,
      validatedSha: binding.validatedSha,
      liveSha: binding.liveSha,
      lastSuccessfulSyncAt: binding.lastSuccessfulSyncAt,
      lastDiagnostic: binding.lastDiagnostic,
      nextPrReconcileAt: binding.nextPrReconcileAt,
      lastPrReconcileError: binding.lastPrReconcileError,
      docsEnabled: binding.docsEnabled,
      pagesDirectory: binding.pagesDirectory,
      pagesDiagnostics: (binding.pagesDiagnostics as any[] | null) ?? null,
      pagesSetup: await latestPagesSetup(teamId),
    },
    sync: run
      ? {
          runId: run.runId,
          status: publication?.status ?? run.status,
          publicationId: run.publicationId,
          commitSha: run.observedSha,
          diagnostic: run.diagnostic,
          diagnostics,
          nextAttemptAt: run.nextAttemptAt,
        }
      : null,
  });
}
export async function changeGitHubSourceState(
  teamId: string,
  actor: AuthzContext,
  action: "pause" | "resume" | "disconnect",
  config?: ReturnType<typeof getDocsGitHubAppConfig>,
  app?: DocsGitHubApp,
) {
  requireGitManager(teamId, actor);
  const before = await db.query.documentationGitBindings.findFirst({
    where: eq(bindings.teamId, teamId),
  });
  if (!before) throw new GitHubDocsError("SOURCE_REQUIRES_GIT", 409);
  if (action === "resume") {
    if (before.status !== "paused")
      throw new GitHubDocsError("GITHUB_REAUTHORIZE_REQUIRED", 409);
    await readGitBindingAccess(
      before,
      app ?? new DocsGitHubApp(config ?? getDocsGitHubAppConfig()),
    );
  }
  await db.transaction(async (tx) => {
    await lockSettings(tx, teamId);
    const binding = await tx.query.documentationGitBindings.findFirst({
      where: eq(bindings.teamId, teamId),
    });
    if (!binding || binding.generation !== before.generation)
      throw new GitHubDocsError("GITHUB_SUPERSEDED", 409);
    const status =
      action === "resume"
        ? "connected"
        : action === "pause"
          ? "paused"
          : "disconnected";
    if (binding.status === status) return;
    await supersedeGitWork(tx, teamId);
    await tx
      .update(bindings)
      .set({
        status,
        generation: binding.generation + 1,
        lastDiagnostic: null,
        updatedAt: new Date(),
      })
      .where(eq(bindings.teamId, teamId));
    if (action === "resume") await enqueueGitSync(teamId, {}, tx);
  });
  return getGitHubSource(teamId);
}
