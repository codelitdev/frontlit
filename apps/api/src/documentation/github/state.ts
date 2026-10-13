import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../../db/client";
import {
  documentationGitBindings as bindings,
  documentationGitJobs as jobs,
  documentationPublications as publications,
} from "../../db/schema";
import { lockSettings } from "../authoring";
import { requireDocumentationWorkCapacity } from "../admission";
import { DocsGitHubApp, getDocsGitHubAppConfig, GitHubDocsError } from "./app";

export type GitBinding = typeof bindings.$inferSelect;
export async function supersedeGitWork(tx: any, teamId: string) {
  const now = new Date();
  await tx
    .update(jobs)
    .set({
      status: "superseded",
      finishedAt: now,
      leaseToken: null,
      leaseExpiresAt: null,
    })
    .where(
      and(
        eq(jobs.teamId, teamId),
        inArray(jobs.status, ["queued", "running", "preparing"]),
      ),
    );
  await tx
    .update(publications)
    .set({
      status: "superseded",
      finishedAt: now,
      leaseToken: null,
      leaseExpiresAt: null,
    })
    .where(
      and(
        eq(publications.teamId, teamId),
        eq(publications.source, "git"),
        inArray(publications.status, ["queued", "preparing", "prepared"]),
      ),
    );
}
/** Callers may supply a transaction already holding the team documentation lock. */
export async function enqueueGitSync(
  teamId: string,
  options: {
    reviewedSha?: string;
    expectedGeneration?: number;
    expectedRequestGeneration?: number;
    trigger?: typeof jobs.$inferInsert.trigger;
  } = {},
  executor?: any,
) {
  const run = async (tx: any) => {
    const settings = await lockSettings(tx, teamId);
    const binding = (await tx.query.documentationGitBindings.findFirst({
      where: eq(bindings.teamId, teamId),
    })) as GitBinding | undefined;
    if (
      !binding ||
      settings.source !== "git" ||
      binding.status !== "connected" ||
      !binding.capabilities.read ||
      (options.expectedGeneration !== undefined &&
        binding.generation !== options.expectedGeneration)
    )
      throw new GitHubDocsError("SOURCE_REQUIRES_GIT", 409);
    if (
      options.expectedRequestGeneration !== undefined &&
      binding.requestedGeneration !== options.expectedRequestGeneration
    )
      throw new GitHubDocsError("GITHUB_SUPERSEDED", 409);
    if (options.trigger === "manual")
      await requireDocumentationWorkCapacity(tx, teamId);
    await supersedeGitWork(tx, teamId);
    const requestGeneration = binding.requestedGeneration + 1;
    await tx
      .update(bindings)
      .set({
        requestedGeneration: requestGeneration,
        nextReconcileAt: new Date(Date.now() + 15 * 60_000),
        updatedAt: new Date(),
      })
      .where(eq(bindings.teamId, teamId));
    const [job] = await tx
      .insert(jobs)
      .values({
        teamId,
        connectionGeneration: binding.generation,
        requestGeneration,
        reviewedSha: options.reviewedSha ?? null,
        trigger: options.trigger ?? "reconcile",
      })
      .returning();
    return job as typeof jobs.$inferSelect;
  };
  return executor ? run(executor) : db.transaction(run);
}
export async function markGitAccessLost(
  teamId: string,
  generation: number,
  code: string,
) {
  return db.transaction(async (tx) => {
    await lockSettings(tx, teamId);
    const [row] = await tx
      .update(bindings)
      .set({
        status: "access_lost",
        generation: sql`${bindings.generation} + 1`,
        lastDiagnostic: code,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(bindings.teamId, teamId),
          eq(bindings.generation, generation),
          eq(bindings.status, "connected"),
        ),
      )
      .returning();
    if (row) await supersedeGitWork(tx, teamId);
    return row;
  });
}
export async function readGitBindingAccess(
  binding: GitBinding,
  app = new DocsGitHubApp(getDocsGitHubAppConfig()),
) {
  const installation = await app.installation(Number(binding.installationId));
  if (
    installation.id !== Number(binding.installationId) ||
    installation.suspended_at ||
    !["read", "write"].includes(installation.permissions.contents)
  )
    throw new GitHubDocsError("GITHUB_ACCESS_LOST", 403);
  const credential = await app.installationToken(
    Number(binding.installationId),
    Number(binding.repositoryId),
  );
  const repository = await app.repositoryById(
    credential.token,
    Number(binding.repositoryId),
  );
  if (
    String(repository.id) !== binding.repositoryId ||
    String(repository.owner.id) !== binding.ownerId
  )
    throw new GitHubDocsError("GITHUB_OWNER_CHANGED", 403);
  // Same stable owner/repository rename is safe; transfer never silently rebinds.
  await db
    .update(bindings)
    .set({
      ownerLogin: repository.owner.login,
      repositoryName: repository.name,
      repositoryPrivate: repository.private,
    })
    .where(
      and(
        eq(bindings.teamId, binding.teamId),
        eq(bindings.generation, binding.generation),
      ),
    );
  return { token: credential.token, repository };
}
export async function checkGitPublicationHead(
  job: typeof publications.$inferSelect,
  app = new DocsGitHubApp(getDocsGitHubAppConfig()),
) {
  const context = job.gitContext;
  if (!context) throw new GitHubDocsError("GITHUB_SOURCE_PROVENANCE_REQUIRED", 409);
  const binding = await db.query.documentationGitBindings.findFirst({
    where: eq(bindings.teamId, job.teamId),
  });
  if (
    !binding ||
    binding.status !== "connected" ||
    !binding.capabilities.read ||
    binding.generation !== context.connectionGeneration ||
    binding.requestedGeneration !== context.requestGeneration ||
    binding.repositoryId !== context.repositoryId ||
    binding.ownerId !== context.ownerId ||
    binding.installationId !== context.installationId
  )
    return false;
  try {
    const access = await readGitBindingAccess(binding, app);
    const head = await app.branchHead(
      access.token,
      access.repository.owner.login,
      access.repository.name,
      binding.branch,
    );
    if (head === context.commitSha) return true;
    await enqueueGitSync(job.teamId, {
      expectedGeneration: binding.generation,
      expectedRequestGeneration: binding.requestedGeneration,
    });
    return false;
  } catch (error) {
    if (
      error instanceof GitHubDocsError &&
      ["GITHUB_ACCESS_LOST", "GITHUB_OWNER_CHANGED"].includes(error.code)
    )
      await markGitAccessLost(binding.teamId, binding.generation, error.code);
    throw error;
  }
}
