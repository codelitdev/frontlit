import { gitSiteFolders, gitSiteRoot } from "@frontlit/api-contract";
import { and, eq, inArray } from "drizzle-orm";
import { createHash } from "node:crypto";
import {
  DocsContentError,
  diagnostic,
  normalizeDocsSourceDirectory,
  serializeDocsMarkdown,
  splitDocsFrontmatter,
} from "@frontlit/text-editor/docs";
import type { AuthzContext } from "../../auth/authorize";
import { db } from "../../db/client";
import {
  documents,
  docSections,
  documentationSettings as settingsTable,
  documentationPublications as publications,
  documentationMemberships as memberships,
  documentationRevisions as revisions,
  documentationGitMigrations as migrations,
  documentationGitMigrationPrs as migrationPrs,
  documentationGitPreflights as preflights,
  documentationGitBindings as bindings,
  documentationGitSetups as setups,
  documentationGitFiles as files,
  documentationGitJobs as jobs,
  documentationDeliveryOutbox as outbox,
} from "../../db/schema";
import { lockSettings } from "../authoring";
import { digest } from "../publications";
import { serializeDates } from "../../utils/public";
import { DocsGitHubApp, getDocsGitHubAppConfig, GitHubDocsError } from "./app";
import { authorizedSetup, requireGitManager, verifySetupRepository } from "./setup";
import {
  importDocumentationTree,
  GIT_DOCS_LIMITS,
  type GitTreeEntry,
  type DocumentationGitManifest,
} from "./importer";
import {
  gitDocumentSnapshot,
  getGitHubSource,
  validateGitManifest,
  type GitSourceSelection,
} from "./source";
import { enqueueGitSync } from "./state";
import { authoringHash } from "./worker";
import { requireGitPlanCapacity, reserveGitValidation } from "./admission";

function requireRestoreReady() {
  if (process.env.DOCS_RESTORE_PENDING === "true")
    throw new DocsContentError([
      diagnostic(
        "RESTORE_PENDING",
        "Replay the deletion ledger before enabling documentation imports.",
      ),
    ]);
}
type Plan = typeof migrations.$inferSelect;
const textHash = (text: string) => createHash("sha256").update(text).digest("hex");
function fail(code: string): never {
  throw new GitHubDocsError(code, 409);
}
const TTL = 24 * 60 * 60_000;

/** Canonical Markdown includes supported metadata, while retaining inert unknown keys. */
function exportDoc(row: typeof documents.$inferSelect, published: boolean) {
  const fm: any = {
    ...(row.draftMeta.frontmatter ?? {}),
    title: row.draftTitle,
    slug: row.draftSlug ?? row.slug,
    description: row.draftExcerpt ?? "",
    nav_order: row.draftMeta.order ?? 0,
    published,
    indexable: row.draftMeta.indexable !== false,
  };
  delete fm.featured_image;
  if (row.draftFeaturedImage)
    fm.featured_image = {
      url: row.draftFeaturedImage.url,
      alt: row.draftFeaturedImage.alt ?? "",
    };
  return serializeDocsMarkdown(row.draftContent, fm);
}
async function exportedManifest(
  exported: Plan["files"],
  directory: string,
  sha: string,
) {
  const entries: GitTreeEntry[] = [];
  const directories = new Set<string>();
  const blobs = new Map<string, Buffer>();
  for (const file of exported) {
    const pieces = file.path.split("/");
    for (let i = 1; i < pieces.length; i++)
      directories.add(pieces.slice(0, i).join("/"));
    const blob = file.hash.slice(0, 40);
    blobs.set(blob, Buffer.from(file.markdown));
    entries.push({ path: file.path, type: "blob", mode: "100644", sha: blob });
  }
  for (const path of directories)
    entries.push({ path, type: "tree", mode: "040000", sha });
  return importDocumentationTree({
    commitSha: sha,
    directory,
    entries,
    readBlob: async (id) => blobs.get(id)!,
  });
}
function semanticDoc(doc: DocumentationGitManifest["docs"][number]) {
  return textHash(
    serializeDocsMarkdown(doc.content, {
      ...doc.frontmatter,
      title: doc.title,
      slug: doc.slug,
      description: doc.description,
      nav_order: doc.navOrder,
      published: doc.published,
      indexable: doc.indexable,
    }),
  );
}
function mismatch(
  expected: DocumentationGitManifest,
  actual: DocumentationGitManifest,
) {
  const diagnostics = [];
  for (const doc of expected.docs) {
    const found = actual.docs.find((d) => d.sourcePath === doc.sourcePath);
    if (
      !found ||
      semanticDoc(found) !== semanticDoc(doc) ||
      found.sectionSlug !== doc.sectionSlug
    )
      diagnostics.push(
        diagnostic(
          "MIGRATION_CONTENT_MISMATCH",
          "The committed document differs from the reviewed export.",
          { file: doc.sourcePath },
        ),
      );
  }
  for (const doc of actual.docs)
    if (!expected.docs.some((d) => d.sourcePath === doc.sourcePath))
      diagnostics.push(
        diagnostic(
          "MIGRATION_EXTRA_DOCUMENT",
          "The target contains an additional managed document.",
          { file: doc.sourcePath },
        ),
      );
  const sections = (m: DocumentationGitManifest) =>
    m.sections
      .map((s) => [s.folder, s.name, s.order])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  if (digest(sections(expected)) !== digest(sections(actual)))
    diagnostics.push(
      diagnostic(
        "MIGRATION_SECTIONS_MISMATCH",
        "Committed Section labels/order differ from the reviewed export.",
      ),
    );
  return diagnostics;
}
export async function ownedPlan(
  teamId: string,
  planId: string,
  actor: AuthzContext,
  executor: any = db,
) {
  requireGitManager(teamId, actor);
  const row = (await executor.query.documentationGitMigrations.findFirst({
    where: and(eq(migrations.teamId, teamId), eq(migrations.planId, planId)),
  })) as Plan | undefined;
  if (!row || row.actorAccountId !== actor.accountId) fail("GITHUB_USER_AUTH_REQUIRED");
  return row!;
}
export async function currentPlan(tx: any, plan: Plan) {
  const settings = await lockSettings(tx, plan.teamId);
  if (plan.expiresAt <= new Date() || !["planned", "verified"].includes(plan.status))
    fail("MIGRATION_EXPIRED");
  if (
    settings.source !== "editor" ||
    settings.draftVersion !== plan.docsDraftVersion ||
    settings.activePublicationId !== plan.activePublicationId
  )
    fail("MIGRATION_STALE");
  const pending = await tx.query.documentationPublications.findFirst({
    where: and(
      eq(publications.teamId, plan.teamId),
      inArray(publications.status, ["queued", "preparing", "prepared"]),
    ),
  });
  const pendingGit = await tx.query.documentationGitJobs.findFirst({
    where: and(
      eq(jobs.teamId, plan.teamId),
      inArray(jobs.status, ["queued", "running", "preparing"]),
    ),
  });
  if (pending || pendingGit) fail("PUBLICATION_PENDING");
  const docs = await tx.query.documents.findMany({
    where: and(eq(documents.teamId, plan.teamId), eq(documents.kind, "doc")),
  });
  const captured = plan.files.filter((f) => f.documentId);
  if (
    docs.length !== captured.length ||
    captured.some(
      (f) =>
        !docs.some(
          (d: any) =>
            d.documentId === f.documentId && d.draftVersion === f.draftVersion,
        ),
    )
  )
    fail("MIGRATION_STALE");
  return { settings, docs: docs as (typeof documents.$inferSelect)[] };
}
export async function getGitMigration(
  teamId: string,
  actor: AuthzContext,
  planId: string,
  offset = 0,
  limit = 25,
) {
  const plan = await ownedPlan(teamId, planId, actor);
  const preflight = plan.preflightId
    ? await db.query.documentationGitPreflights.findFirst({
        where: eq(preflights.preflightId, plan.preflightId),
      })
    : null;
  const pullRequest = await db.query.documentationGitMigrationPrs.findFirst({
    where: and(eq(migrationPrs.teamId, teamId), eq(migrationPrs.planId, planId)),
  });
  if (
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 50
  )
    throw new GitHubDocsError("INVALID_REQUEST", 400);
  const status =
    plan.expiresAt <= new Date() &&
    plan.status !== "activated" &&
    plan.status !== "canceled"
      ? "expired"
      : plan.status;
  // Bound both file count and response bytes; a single file already satisfies parser limits.
  const selected: Plan["files"] = [];
  let bytes = 0;
  for (const file of plan.files.slice(offset, offset + limit)) {
    const size = Buffer.byteLength(file.markdown);
    if (selected.length && bytes + size > 1024 * 1024) break;
    selected.push(file);
    bytes += size;
  }
  return serializeDates({
    planId,
    status,
    setupId: plan.setupId,
    selection: { ...plan.selection, root: gitSiteRoot(plan.selection.directory) },
    docsDraftVersion: plan.docsDraftVersion,
    activePublicationId: plan.activePublicationId,
    planHash: plan.planHash,
    verifiedSha: plan.verifiedSha,
    expiresAt: plan.expiresAt,
    sections: plan.sections,
    total: plan.files.length,
    files: selected,
    nextOffset:
      offset + selected.length < plan.files.length ? offset + selected.length : null,
    pullRequest: pullRequest
      ? {
          planId: pullRequest.planId,
          status: pullRequest.status,
          branch: pullRequest.branch,
          commitSha: pullRequest.commitSha,
          bootstrapSha: pullRequest.bootstrapSha,
          pullRequestNumber: pullRequest.pullRequestNumber,
          pullRequestUrl: pullRequest.pullRequestUrl,
          mergedCommitSha: pullRequest.mergedCommitSha,
          diagnostic: pullRequest.diagnostic,
          createdAt: pullRequest.createdAt,
          finishedAt: pullRequest.finishedAt,
        }
      : null,
    requiresManualCommit: false,
    repositoryPrivate: preflight?.repositoryPrivate ?? null,
    repositoryName: preflight
      ? `${preflight.ownerLogin}/${preflight.repositoryName}`
      : null,
    initializeEmptyRepositoryRequired: preflight?.commitSha === null,
    unpublishedDraftCount: plan.files.filter(
      (file) =>
        file.documentId &&
        splitDocsFrontmatter(file.markdown, file.path).frontmatter.published === false,
    ).length,
    diagnostics: [],
  });
}
export async function planGitMigration(
  teamId: string,
  actor: AuthzContext,
  input: GitSourceSelection & {
    expectedDocsDraftVersion: number;
    expectedPublicationId: string | null;
  },
  config = getDocsGitHubAppConfig(),
  app = new DocsGitHubApp(config),
) {
  requireGitManager(teamId, actor, false, true);
  requireRestoreReady();
  const directory = normalizeDocsSourceDirectory(gitSiteFolders(input.root).docs);
  const access = await verifySetupRepository(
    teamId,
    input.setupId,
    actor,
    input,
    config,
    app,
  );
  let sha: string | null;
  try {
    sha = await app.branchHead(
      access.installationToken,
      access.repository.owner.login,
      access.repository.name,
      input.branch,
    );
  } catch (error) {
    if (
      !(error instanceof GitHubDocsError) ||
      ![404, 409].includes(error.status ?? 0) ||
      !(await app.repositoryIsEmpty(
        access.installationToken,
        access.repository.owner.login,
        access.repository.name,
      ))
    )
      throw error;
    if (input.branch !== access.repository.default_branch)
      throw new GitHubDocsError("GITHUB_REPOSITORY_INITIALIZATION_CONFLICT", 409);
    sha = null;
  }
  const plan = await db.transaction(async (tx) => {
    const settings = await lockSettings(tx, teamId);
    await requireGitPlanCapacity(tx, teamId);
    if (
      settings.source !== "editor" ||
      settings.draftVersion !== input.expectedDocsDraftVersion ||
      settings.activePublicationId !== input.expectedPublicationId
    )
      fail("MIGRATION_STALE");
    if (
      await tx.query.documentationPublications.findFirst({
        where: and(
          eq(publications.teamId, teamId),
          inArray(publications.status, ["queued", "preparing", "prepared"]),
        ),
      })
    )
      fail("PUBLICATION_PENDING");
    const docs = await tx.query.documents.findMany({
      where: and(eq(documents.teamId, teamId), eq(documents.kind, "doc")),
    });
    if (docs.length > GIT_DOCS_LIMITS.files) fail("CANDIDATE_LIMIT");
    const sections = await tx.query.docSections.findMany({
      where: eq(docSections.teamId, teamId),
    });
    const live = settings.activePublicationId
      ? await tx
          .select({ member: memberships, revision: revisions })
          .from(memberships)
          .innerJoin(revisions, eq(memberships.revisionId, revisions.revisionId))
          .where(eq(memberships.publicationId, settings.activePublicationId))
      : [];
    if (!settings.activePublicationId && docs.some((d) => d.publishedAt))
      fail("MIGRATION_BOOTSTRAP_REQUIRED");
    const exported: Plan["files"] = [];
    for (const draft of docs) {
      // Git starts from the published state; newer editor edits stay local drafts.
      const accepted = live.find((x) => x.member.documentId === draft.documentId);
      const doc = accepted
        ? {
            ...draft,
            draftTitle: accepted.revision.snapshot.draftTitle,
            draftSlug: accepted.revision.snapshot.draftSlug,
            draftContent: accepted.revision.snapshot.draftContent,
            draftExcerpt: accepted.revision.snapshot.draftExcerpt,
            draftFeaturedImage: accepted.revision.snapshot.draftFeaturedImage,
            draftMeta: accepted.revision.snapshot.draftMeta,
          }
        : draft;
      const unpublished = !!accepted && exportDoc(draft, true) !== exportDoc(doc, true);
      const section = sections.find((s) => s.sectionId === doc.draftMeta.sectionId);
      if (doc.draftMeta.sectionId && !section) fail("MIGRATION_SECTIONS_MISMATCH");
      const path = `${directory}/${section ? `${section.slug}/` : ""}${doc.documentId}.md`;
      const markdown = exportDoc(doc, !!accepted);
      exported.push({
        path,
        documentId: doc.documentId,
        draftVersion: doc.draftVersion,
        markdown,
        hash: textHash(markdown),
        ...(unpublished ? { unpublished } : {}),
      });
    }
    const markdown =
      JSON.stringify(
        {
          version: 1,
          sections: sections.map((s) => ({
            folder: s.slug,
            name: s.name,
            order: s.order,
          })),
        },
        null,
        2,
      ) + "\n";
    exported.push({
      path: `${directory}/_sections.json`,
      documentId: null,
      draftVersion: null,
      markdown,
      hash: textHash(markdown),
    });
    exported.sort((a, b) => a.path.localeCompare(b.path));
    const manifest = sha ? await exportedManifest(exported, directory, sha) : null;
    const expiresAt = new Date(Date.now() + TTL);
    const [preflight] = await tx
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
        manifest,
        manifestHash: digest(manifest),
        expiresAt,
      })
      .returning();
    const selection = {
      installationId: input.installationId,
      repositoryId: input.repositoryId,
      branch: input.branch,
      directory,
    };
    const [created] = await tx
      .insert(migrations)
      .values({
        teamId,
        setupId: input.setupId,
        actorAccountId: actor.accountId!,
        preflightId: preflight.preflightId,
        docsDraftVersion: settings.draftVersion,
        activePublicationId: settings.activePublicationId,
        planHash: digest({
          exported,
          sections,
          selection,
          docsDraftVersion: settings.draftVersion,
          activePublicationId: settings.activePublicationId,
        }),
        selection,
        files: exported,
        sections,
        expiresAt,
      })
      .returning();
    await authorizedSetup(teamId, input.setupId, actor, tx);
    return created;
  });
  return getGitMigration(teamId, actor, plan.planId);
}
export async function verifyGitMigration(
  teamId: string,
  actor: AuthzContext,
  planId: string,
  input: { setupId?: string } = {},
  config = getDocsGitHubAppConfig(),
  app = new DocsGitHubApp(config),
) {
  requireGitManager(teamId, actor, false, true);
  requireRestoreReady();
  await reserveGitValidation(teamId, actor);
  const plan = await ownedPlan(teamId, planId, actor);
  await db.transaction(async (tx) => {
    await lockSettings(tx, teamId);
    const current = await ownedPlan(teamId, planId, actor, tx);
    await currentPlan(tx, current);
    // A fresh check replaces the previous proof. Failed verification must not
    // restore a ready-to-activate state when the Source screen is reloaded.
    if (current.status === "verified")
      await tx
        .update(migrations)
        .set({ status: "planned", verifiedSha: null })
        .where(eq(migrations.planId, planId));
  });
  const setupId = input.setupId ?? plan.setupId;
  const access = await verifySetupRepository(
    teamId,
    setupId,
    actor,
    plan.selection,
    config,
    app,
  );
  const proof = (await db.query.documentationGitPreflights.findFirst({
    where: eq(preflights.preflightId, plan.preflightId!),
  }))!;
  if (!proof || proof.ownerId !== String(access.repository.owner.id))
    fail("GITHUB_OWNER_CHANGED");
  const sha = await app.branchHead(
    access.installationToken,
    access.repository.owner.login,
    access.repository.name,
    plan.selection.branch,
  );
  const request = await db.query.documentationGitMigrationPrs.findFirst({
    where: and(eq(migrationPrs.planId, planId), eq(migrationPrs.teamId, teamId)),
  });
  if (!request?.pullRequestNumber || !request.commitSha)
    fail("GITHUB_SETUP_PR_REQUIRED");
  const { token: reviewToken } = await app.installationToken(
    plan.selection.installationId,
    plan.selection.repositoryId,
    "review",
  );
  const pr = await app.findMigrationPullRequest(
    reviewToken,
    access.repository.owner.login,
    access.repository.name,
    {
      planId,
      base: plan.selection.branch,
      repositoryId: plan.selection.repositoryId,
    },
  );
  if (
    !pr ||
    pr.number !== request.pullRequestNumber ||
    pr.headSha !== request.commitSha
  )
    fail("GITHUB_PROPOSAL_RECOVERY_CONFLICT");
  if (!pr.merged || !pr.mergeCommitSha) fail("GITHUB_SETUP_PR_NOT_MERGED");
  if (
    sha !== pr.mergeCommitSha &&
    !(await app.isAncestor(
      access.installationToken,
      access.repository.owner.login,
      access.repository.name,
      pr.mergeCommitSha,
      sha,
    ))
  )
    fail("MIGRATION_HEAD_CHANGED");
  await db.transaction(async (tx) => {
    await currentPlan(tx, plan);
    await tx
      .update(migrationPrs)
      .set({
        status: "merged",
        mergedCommitSha: pr.mergeCommitSha,
        diagnostic: null,
        leaseToken: null,
        leaseExpiresAt: null,
        finishedAt: new Date(),
      })
      .where(
        and(
          eq(migrationPrs.planId, planId),
          eq(migrationPrs.pullRequestNumber, pr.number),
        ),
      );
  });
  let manifest: DocumentationGitManifest;
  try {
    manifest = await importDocumentationTree({
      commitSha: sha,
      directory: plan.selection.directory,
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
    const expected = await exportedManifest(plan.files, plan.selection.directory, sha);
    const diagnostics = mismatch(expected, manifest);
    const validated = await validateGitManifest(teamId, manifest);
    diagnostics.push(...validated.diagnostics);
    if (diagnostics.some((d) => d.blocksPublish))
      return {
        planId,
        commitSha: sha,
        planHash: plan.planHash,
        verified: false,
        diagnostics,
      };
  } catch (error) {
    if (error instanceof DocsContentError)
      return {
        planId,
        commitSha: sha,
        planHash: plan.planHash,
        verified: false,
        diagnostics: error.diagnostics,
      };
    throw error;
  }
  await db.transaction(async (tx) => {
    await lockSettings(tx, teamId);
    const current = await ownedPlan(teamId, planId, actor, tx);
    await currentPlan(tx, current);
    await authorizedSetup(teamId, setupId, actor, tx);
    await tx
      .update(preflights)
      .set({ setupId, manifest, manifestHash: digest(manifest), commitSha: sha })
      .where(eq(preflights.preflightId, proof.preflightId));
    await tx
      .update(migrations)
      .set({ status: "verified", setupId, verifiedSha: sha })
      .where(eq(migrations.planId, planId));
  });
  return {
    planId,
    commitSha: sha,
    planHash: plan.planHash,
    verified: true,
    diagnostics: [],
  };
}
export async function cancelGitMigration(
  teamId: string,
  actor: AuthzContext,
  planId: string,
) {
  return db.transaction(async (tx) => {
    await lockSettings(tx, teamId);
    const plan = await ownedPlan(teamId, planId, actor, tx);
    if (plan.status === "activated") fail("MIGRATION_ALREADY_ACTIVATED");
    await tx
      .update(migrations)
      .set({ status: "canceled" })
      .where(eq(migrations.planId, planId));
    await tx
      .update(migrationPrs)
      .set({
        status: "canceled",
        leaseToken: null,
        leaseExpiresAt: null,
        finishedAt: new Date(),
      })
      .where(and(eq(migrationPrs.teamId, teamId), eq(migrationPrs.planId, planId)));
    return { planId, status: "canceled" as const };
  });
}
export async function activateGitMigration(
  teamId: string,
  actor: AuthzContext,
  planId: string,
  input: {
    commitSha: string;
    planHash: string;
    expectedDocsDraftVersion: number;
    expectedPublicationId: string | null;
    idempotencyKey: string;
    setupId?: string;
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
  requireRestoreReady();
  if (
    input.consent?.publishSelectedDocsPublicly !== true ||
    input.consent?.automaticallyPublishFuturePushes !== true ||
    input.consent?.delegateToWorkspacePublishers !== true
  )
    throw new GitHubDocsError("GITHUB_PUBLICATION_CONSENT_REQUIRED", 400);
  const hash = digest({ planId, ...input });
  const replay = await db.query.documentationGitBindings.findFirst({
    where: eq(bindings.teamId, teamId),
  });
  if (replay?.connectionReceipt?.key === input.idempotencyKey) {
    if (
      replay.connectionReceipt.inputHash !== hash ||
      replay.connectionReceipt.actorAccountId !== actor.accountId
    )
      fail("IDEMPOTENCY_CONFLICT");
    return getGitHubSource(teamId);
  }
  const plan = await ownedPlan(teamId, planId, actor);
  if (
    plan.status !== "verified" ||
    plan.verifiedSha !== input.commitSha ||
    plan.planHash !== input.planHash ||
    plan.docsDraftVersion !== input.expectedDocsDraftVersion ||
    plan.activePublicationId !== input.expectedPublicationId
  )
    fail("MIGRATION_STALE");
  const setupId = input.setupId ?? plan.setupId;
  const access = await verifySetupRepository(
    teamId,
    setupId,
    actor,
    plan.selection,
    config,
    app,
  );
  const proof = await db.query.documentationGitPreflights.findFirst({
    where: eq(preflights.preflightId, plan.preflightId!),
  });
  if (!proof || !proof.manifest || proof.ownerId !== String(access.repository.owner.id))
    fail("GITHUB_OWNER_CHANGED");
  const adoptedManifest = proof.manifest;
  const report = await validateGitManifest(teamId, adoptedManifest);
  if (!report.publishable) throw new DocsContentError(report.diagnostics);
  const head = await app.branchHead(
    access.installationToken,
    access.repository.owner.login,
    access.repository.name,
    plan.selection.branch,
  );
  if (head !== input.commitSha) fail("MIGRATION_HEAD_CHANGED");
  await db.transaction(async (tx) => {
    await lockSettings(tx, teamId);
    requireRestoreReady();
    const current = await ownedPlan(teamId, planId, actor, tx);
    const { settings, docs } = await currentPlan(tx, current);
    if (current.status !== "verified" || current.verifiedSha !== head)
      fail("MIGRATION_STALE");
    const setup = await authorizedSetup(teamId, setupId, actor, tx);
    const old = await tx.query.documentationGitBindings.findFirst({
      where: eq(bindings.teamId, teamId),
    });
    const value = {
      teamId,
      installationId: String(plan.selection.installationId),
      repositoryId: String(plan.selection.repositoryId),
      ownerId: proof.ownerId,
      ownerLogin: access.repository.owner.login,
      repositoryName: access.repository.name,
      repositoryPrivate: access.repository.private,
      branch: plan.selection.branch,
      directory: plan.selection.directory,
      status: "connected" as const,
      generation: (old?.generation ?? 0) + 1,
      requestedGeneration: old?.requestedGeneration ?? 0,
      grantVersion: (old?.grantVersion ?? 0) + 1,
      grantActorAccountId: actor.accountId!,
      grantGithubUserId: setup.githubUserId!,
      repositoryAdminVerified: true,
      capabilities: { read: true, proposals: false, directCommit: false },
      observedSha: head,
      validatedSha: head,
      liveSha: head,
      lastSuccessfulSyncAt: new Date(),
      grantedAt: new Date(),
      updatedAt: new Date(),
      lastDiagnostic: null,
    };
    await tx
      .insert(bindings)
      .values(value)
      .onConflictDoUpdate({ target: bindings.teamId, set: value });
    const sections = plan.sections as (typeof docSections.$inferSelect)[];
    for (const imported of adoptedManifest.docs) {
      const identity = plan.files.find(
        (f) => f.path === imported.sourcePath && f.documentId,
      )!;
      const original = docs.find((d) => d.documentId === identity.documentId)!;
      const section = sections.find((s) => s.slug === imported.sectionSlug);
      await tx
        .update(documents)
        .set({
          draftGitSource: {
            sourcePath: imported.sourcePath,
            base: {
              commitSha: head,
              sourcePath: imported.sourcePath,
              sourceHash: imported.sourceHash,
            },
          },
        })
        .where(eq(documents.documentId, identity.documentId!));
      await tx.insert(files).values({
        teamId,
        sourcePath: imported.sourcePath,
        documentId: identity.documentId!,
        commitSha: head,
        blobSha: imported.blobSha,
        sourceHash: imported.sourceHash,
        markdown: imported.markdown,
        frontmatter: imported.frontmatter,
        snapshot: {
          ...gitDocumentSnapshot(
            imported,
            identity.documentId!,
            section?.sectionId ?? null,
            identity.draftVersion!,
          ),
          // Unpublished edits must differ from the imported base so sync keeps them.
          draftHash: identity.unpublished
            ? await authoringHash(
                gitDocumentSnapshot(
                  imported,
                  identity.documentId!,
                  section?.sectionId ?? null,
                  identity.draftVersion!,
                ),
              )
            : original.draftHash,
        },
      });
    }
    await tx
      .update(settingsTable)
      .set({ source: "git", draftVersion: settings.draftVersion + 1 })
      .where(eq(settingsTable.teamId, teamId));
    const run = await enqueueGitSync(teamId, { trigger: "migration" }, tx);
    await tx
      .update(bindings)
      .set({
        connectionReceipt: {
          actorAccountId: actor.accountId!,
          inputHash: hash,
          key: input.idempotencyKey,
          runId: run.runId,
        },
      })
      .where(eq(bindings.teamId, teamId));
    await tx
      .update(migrations)
      .set({ status: "activated", activatedAt: new Date() })
      .where(eq(migrations.planId, planId));
    await tx
      .update(setups)
      .set({ status: "consumed", encryptedVerifier: null, encryptedUserToken: null })
      .where(eq(setups.setupId, setupId));
    await tx.insert(outbox).values({
      teamId,
      publicationId: settings.activePublicationId,
      policyEpoch: settings.policyEpoch,
      type: "policy",
      payload: {
        operation: "git_adoption",
        planId,
        commitSha: head,
        actorAccountId: actor.accountId,
        consent: input.consent,
      },
    });
  });
  return getGitHubSource(teamId);
}
