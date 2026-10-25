import { and, asc, eq, ne, or, sql } from "drizzle-orm";
import { diagnostic, type DocsDiagnostic } from "@frontlit/text-editor/docs";
import type { ApiOperationSlice, ApiReferenceInfo } from "@frontlit/api-contract";
import { db } from "../../db/client";
import {
  documentationApiOperations as operations,
  documentationApiSpecs as specs,
  documentationDeliveryOutbox as outbox,
  documentationGitBindings as bindings,
  documentationMemberships as memberships,
  documentationSettings as settingsTable,
} from "../../db/schema";
import type { AuthzContext } from "../../auth/authorize";
import { lockSettings } from "../authoring";
import { DocsGitHubApp, getDocsGitHubAppConfig, GitHubDocsError } from "../github/app";
import type { GitTreeEntry } from "../github/importer";
import { requireGitManager } from "../github/setup";
import { enqueueGitSync, readGitBindingAccess } from "../github/state";
import { siteOriginForTeam } from "../../utils/site-url";
import { importOpenApiSpec, normalizeApiMount, type ImportedSpec } from "./import";
import { OPENAPI_LIMITS, OpenApiImportError } from "./parse";

type Executor = any;
type Binding = typeof bindings.$inferSelect;

/** Mounts that would shadow built-in docs routes. */
const RESERVED_MOUNTS = new Set(["collections", "search", "index"]);

const decoder = new TextDecoder("utf-8", { fatal: true });

/** A clean repo-relative file path, or null when it isn't one. */
export function normalizeSpecPath(value: string | null | undefined) {
  const path = (value ?? "")
    .trim()
    .replace(/^\.\/+/, "")
    .replace(/\\/g, "/");
  if (!path) return null;
  if (
    path.startsWith("/") ||
    path.split("/").some((part) => !part || part === "." || part === "..") ||
    !/\.(json|ya?ml)$/i.test(path)
  )
    throw new GitHubDocsError("API_SPEC_PATH_INVALID", 400);
  return path;
}

function asWarning(item: DocsDiagnostic): DocsDiagnostic {
  return item.severity === "warning"
    ? item
    : { ...item, severity: "warning", blocksSave: false, blocksPublish: false };
}

/** Imports the spec at `commitSha` without storing anything. */
export async function readSpecFromTree(input: {
  specPath: string;
  mount: string;
  entries: GitTreeEntry[];
  readBlob: (sha: string) => Promise<Uint8Array>;
}): Promise<{ blobSha: string | null; result: ImportedSpec }> {
  const entry = input.entries.find(
    (e) => e.path === input.specPath && e.type === "blob" && e.mode !== "120000",
  );
  if (!entry)
    throw new OpenApiImportError([
      diagnostic(
        "OPENAPI_NOT_FOUND",
        `No spec file at ${input.specPath} on this branch. Update the spec path if it moved.`,
        { file: input.specPath },
      ),
    ]);
  if ((entry.size ?? 0) > OPENAPI_LIMITS.bytes)
    throw new OpenApiImportError([
      diagnostic("OPENAPI_LIMIT", "The spec is larger than 5 MiB.", {
        file: input.specPath,
      }),
    ]);
  let text: string;
  try {
    text = decoder.decode(await input.readBlob(entry.sha));
  } catch (error) {
    if (error instanceof GitHubDocsError) throw error;
    throw new OpenApiImportError([
      diagnostic("OPENAPI_PARSE", "The spec isn't valid UTF-8 text.", {
        file: input.specPath,
      }),
    ]);
  }
  return {
    blobSha: entry.sha,
    result: importOpenApiSpec({ text, file: input.specPath, mount: input.mount }),
  };
}

async function insertEvent(tx: Executor, teamId: string) {
  const settings = await tx.query.documentationSettings.findFirst({
    where: eq(settingsTable.teamId, teamId),
  });
  await tx.insert(outbox).values({
    teamId,
    publicationId: settings?.activePublicationId ?? null,
    policyEpoch: settings?.policyEpoch ?? 0,
    type: "api_reference",
    payload: { apiSpecId: settings?.activeApiSpecId ?? null },
    destinations: process.env.REVALIDATE_WEBHOOK_SECRET
      ? ["local", "sites"]
      : ["local"],
  });
}

async function recordFailure(
  teamId: string,
  input: { commitSha: string; specPath: string; mount: string },
  diagnostics: DocsDiagnostic[],
) {
  await db.transaction(async (tx) => {
    await lockSettings(tx, teamId);
    await tx
      .delete(specs)
      .where(and(eq(specs.teamId, teamId), eq(specs.status, "failed")));
    await tx.insert(specs).values({
      teamId,
      status: "failed",
      commitSha: input.commitSha,
      sourcePath: input.specPath,
      mount: input.mount,
      diagnostics: diagnostics as any,
    });
  });
}

/** Replaces the live API reference in one transaction. Returns false when
 * the binding changed meanwhile (a newer sync will import again). */
async function activateSpec(
  teamId: string,
  input: {
    commitSha: string;
    specPath: string;
    mount: string;
    generation: number;
    blobSha: string | null;
  },
  imported: ImportedSpec,
) {
  return db.transaction(async (tx) => {
    await lockSettings(tx, teamId);
    const binding = await tx.query.documentationGitBindings.findFirst({
      where: eq(bindings.teamId, teamId),
    });
    if (
      !binding ||
      binding.generation !== input.generation ||
      binding.apiSpecPath !== input.specPath ||
      binding.apiMount !== input.mount
    )
      return false;
    await tx.delete(specs).where(eq(specs.teamId, teamId));
    const [spec] = await tx
      .insert(specs)
      .values({
        teamId,
        status: "active",
        commitSha: input.commitSha,
        sourcePath: input.specPath,
        sourceBlobSha: input.blobSha,
        mount: input.mount,
        spec: imported.spec,
        specHash: imported.specHash,
        info: imported.info as any,
        diagnostics: imported.warnings as any,
      })
      .returning();
    if (imported.operations.length)
      await tx.insert(operations).values(
        imported.operations.map((operation) => ({
          specId: spec.specId,
          teamId,
          route: operation.route,
          title: operation.title,
          group: operation.group,
          order: operation.order,
          method: operation.method,
          path: operation.path,
          deprecated: operation.deprecated,
          slice: JSON.stringify(operation.slice),
          chunks: operation.chunks,
        })),
      );
    await tx
      .update(settingsTable)
      .set({ activeApiSpecId: spec.specId })
      .where(eq(settingsTable.teamId, teamId));
    await insertEvent(tx, teamId);
    return true;
  });
}

/**
 * The API reference step of a Git sync (docs/openapi-support.md §6.2). It
 * runs before pages and docs and never fails the sync: problems are stored
 * on a `failed` row and the live API reference stays as it is.
 */
export async function syncApiReference(input: {
  teamId: string;
  binding: Binding;
  head: string;
  readTree: () => Promise<GitTreeEntry[]>;
  readBlob: (sha: string) => Promise<Uint8Array>;
}) {
  const { teamId, binding, head } = input;
  if (!binding.apiSpecPath) return;
  const target = {
    commitSha: head,
    specPath: binding.apiSpecPath,
    mount: binding.apiMount,
  };
  try {
    const entries = await input.readTree();
    const live = await activeSpecRow(teamId);
    const entry = entries.find((e) => e.path === target.specPath && e.type === "blob");
    if (
      live &&
      entry &&
      live.sourceBlobSha === entry.sha &&
      live.sourcePath === target.specPath &&
      live.mount === target.mount
    ) {
      // Unchanged; a stale failure from an earlier commit no longer applies.
      await db
        .delete(specs)
        .where(and(eq(specs.teamId, teamId), eq(specs.status, "failed")));
      return;
    }
    const { blobSha, result } = await readSpecFromTree({
      specPath: target.specPath,
      mount: target.mount,
      entries,
      readBlob: input.readBlob,
    });
    await activateSpec(
      teamId,
      { ...target, generation: binding.generation, blobSha },
      result,
    );
  } catch (error) {
    if (error instanceof OpenApiImportError) {
      await recordFailure(teamId, target, error.diagnostics);
      return;
    }
    // A GitHub or database problem: the docs and pages steps that follow
    // report it; the live API reference stays.
    console.error("API reference sync failed", error);
  }
}

async function activeSpecRow(teamId: string) {
  const settings = await db.query.documentationSettings.findFirst({
    where: eq(settingsTable.teamId, teamId),
  });
  if (!settings?.activeApiSpecId) return null;
  return (
    (await db.query.documentationApiSpecs.findFirst({
      where: and(
        eq(specs.specId, settings.activeApiSpecId),
        eq(specs.teamId, teamId),
        eq(specs.status, "active"),
      ),
    })) ?? null
  );
}

/** Mount problems: reserved names, or docs pages already published under it. */
async function mountConflict(teamId: string, mount: string) {
  if (RESERVED_MOUNTS.has(mount)) return `/docs/${mount} is reserved.`;
  const settings = await db.query.documentationSettings.findFirst({
    where: eq(settingsTable.teamId, teamId),
  });
  if (!settings?.activePublicationId) return null;
  const clash = await db.query.documentationMemberships.findFirst({
    where: and(
      eq(memberships.publicationId, settings.activePublicationId),
      or(eq(memberships.route, mount), sql`${memberships.route} like ${`${mount}/%`}`),
    ),
  });
  return clash ? `Docs pages are already published under /docs/${mount}.` : null;
}

async function connectedBinding(teamId: string) {
  const binding = await db.query.documentationGitBindings.findFirst({
    where: eq(bindings.teamId, teamId),
  });
  if (binding?.status !== "connected")
    throw new GitHubDocsError("SOURCE_REQUIRES_GIT", 409);
  return binding;
}

/** Dry run of a spec path at the branch head, for the admin settings. */
export async function previewApiReference(
  teamId: string,
  actor: AuthzContext,
  input: { specPath: string | null; mount?: string },
  app = new DocsGitHubApp(getDocsGitHubAppConfig()),
) {
  requireGitManager(teamId, actor);
  const binding = await connectedBinding(teamId);
  const specPath = normalizeSpecPath(input.specPath);
  const mount = normalizeApiMount(input.mount ?? binding.apiMount);
  if (!specPath) throw new GitHubDocsError("API_SPEC_PATH_INVALID", 400);
  const access = await readGitBindingAccess(binding, app);
  const owner = access.repository.owner.login;
  const name = access.repository.name;
  const commitSha = await app.branchHead(access.token, owner, name, binding.branch);
  const conflict = await mountConflict(teamId, mount);
  const base = { commitSha, specPath, mount };
  try {
    const { result } = await readSpecFromTree({
      specPath,
      mount,
      entries: await app.commitTree(access.token, owner, name, commitSha),
      readBlob: (sha) => app.blob(access.token, owner, name, sha),
    });
    const diagnostics = [...result.warnings];
    if (conflict)
      diagnostics.unshift(
        diagnostic("ROUTE_COLLISION", conflict, { route: `/docs/${mount}` }),
      );
    return {
      ...base,
      publishable: !conflict,
      title: result.info.title,
      routes: result.operations.map((o) => ({
        route: `/docs/${o.route}`,
        method: o.method,
        path: o.path,
      })),
      diagnostics,
    };
  } catch (error) {
    if (!(error instanceof OpenApiImportError)) throw error;
    return {
      ...base,
      publishable: false,
      title: null,
      routes: [],
      diagnostics: error.diagnostics,
    };
  }
}

/** Saves the spec path and URL path and syncs right away. A null spec path
 * unpublishes the API reference and deletes its rows. */
export async function updateApiReferenceSettings(
  teamId: string,
  actor: AuthzContext,
  input: { specPath: string | null; mount?: string },
) {
  requireGitManager(teamId, actor, true);
  const binding = await connectedBinding(teamId);
  const specPath = normalizeSpecPath(input.specPath);
  const mount = normalizeApiMount(input.mount ?? binding.apiMount);
  if (specPath && (await mountConflict(teamId, mount)))
    throw new GitHubDocsError("API_MOUNT_CONFLICT", 409);
  await db.transaction(async (tx) => {
    await lockSettings(tx, teamId);
    await tx
      .update(bindings)
      .set({ apiSpecPath: specPath, apiMount: mount, updatedAt: new Date() })
      .where(eq(bindings.teamId, teamId));
    if (!specPath) {
      const settings = await tx.query.documentationSettings.findFirst({
        where: eq(settingsTable.teamId, teamId),
      });
      await tx.delete(specs).where(eq(specs.teamId, teamId));
      await tx
        .update(settingsTable)
        .set({ activeApiSpecId: null })
        .where(eq(settingsTable.teamId, teamId));
      if (settings?.activeApiSpecId) await insertEvent(tx, teamId);
      return;
    }
    await enqueueGitSync(teamId, { trigger: "configuration" }, tx);
  });
  return getApiReferenceStatus(teamId);
}

export async function getApiReferenceStatus(teamId: string) {
  const binding = await db.query.documentationGitBindings.findFirst({
    where: eq(bindings.teamId, teamId),
  });
  const rows = await db.query.documentationApiSpecs.findMany({
    where: eq(specs.teamId, teamId),
    columns: { spec: false },
  });
  const live = await activeSpecRow(teamId);
  const failed = rows.find((row) => row.status === "failed") ?? null;
  const count = live
    ? (
        await db
          .select({ count: sql<number>`count(*)::int` })
          .from(operations)
          .where(eq(operations.specId, live.specId))
      )[0].count
    : 0;
  const info = live?.info as unknown as ApiReferenceInfo | undefined;
  return {
    specPath: binding?.apiSpecPath ?? null,
    mount: binding?.apiMount ?? "api-reference",
    live: live
      ? {
          commitSha: live.commitSha,
          sourcePath: live.sourcePath,
          title: info?.title ?? "",
          version: info?.version ?? "",
          operationCount: count,
          createdAt: live.createdAt,
        }
      : null,
    lastFailure: failed
      ? {
          commitSha: failed.commitSha,
          sourcePath: failed.sourcePath,
          createdAt: failed.createdAt,
        }
      : null,
    diagnostics: ((failed ?? live)?.diagnostics ?? []) as unknown as DocsDiagnostic[],
  };
}

// ---------------------------------------------------------------------------
// Public reads
// ---------------------------------------------------------------------------

export async function readApiReference(teamId: string) {
  const live = await activeSpecRow(teamId);
  if (!live) return null;
  const rows = await db
    .select({
      route: operations.route,
      title: operations.title,
      group: operations.group,
      method: operations.method,
      path: operations.path,
      deprecated: operations.deprecated,
    })
    .from(operations)
    .where(eq(operations.specId, live.specId))
    .orderBy(asc(operations.order));
  const groups: { name: string; operations: Omit<(typeof rows)[number], "group">[] }[] =
    [];
  for (const { group, ...operation } of rows) {
    let entry = groups.at(-1);
    if (entry?.name !== group) groups.push((entry = { name: group, operations: [] }));
    entry.operations.push(operation);
  }
  return {
    mount: live.mount,
    commitSha: live.commitSha,
    info: live.info as unknown as ApiReferenceInfo,
    groups,
  };
}

export async function readApiOperation(teamId: string, route: string) {
  const live = await activeSpecRow(teamId);
  if (!live) return null;
  const row = await db.query.documentationApiOperations.findFirst({
    where: and(eq(operations.specId, live.specId), eq(operations.route, route)),
  });
  if (!row) return null;
  return {
    route: row.route,
    mount: live.mount,
    operation: JSON.parse(row.slice) as ApiOperationSlice,
  };
}

export async function readApiSpec(teamId: string) {
  const live = await activeSpecRow(teamId);
  if (!live?.spec) return null;
  return { spec: live.spec, hash: live.specHash ?? "" };
}

/** Keyword search over the live operations' chunks. Operations aren't
 * embedded yet (docs/openapi-support.md §10), so they always match lexically. */
export async function searchApiReference(teamId: string, query: string, k = 6) {
  const settings = await db.query.documentationSettings.findFirst({
    where: eq(settingsTable.teamId, teamId),
  });
  if (!settings?.activeApiSpecId || settings.indexing?.enabled === false) return [];
  const tokens = [...new Set(query.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])];
  if (!tokens.length) return [];
  const rows = await db
    .select({
      route: operations.route,
      title: operations.title,
      chunks: operations.chunks,
    })
    .from(operations)
    .where(eq(operations.specId, settings.activeApiSpecId));
  const origin = await siteOriginForTeam(teamId);
  const floor = settings.indexing?.mode === "semantic" ? 0.5 : 0;
  return rows
    .flatMap((row) =>
      row.chunks.map((chunk) => {
        const text =
          `${row.title} ${chunk.heading ?? ""} ${chunk.content}`.toLowerCase();
        return {
          documentId: row.route,
          slug: row.route,
          title: row.title,
          ...chunk,
          similarity:
            tokens.filter((token) => text.includes(token)).length / tokens.length,
          kind: "api-operation" as const,
          url: `${origin}/docs/${row.route}${chunk.anchor ? `#${encodeURIComponent(chunk.anchor)}` : ""}`,
        };
      }),
    )
    .filter((c) => c.similarity > floor)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, k);
}

/** Routes under the API mount, for docs route validation. */
export async function apiMountFor(teamId: string) {
  const binding = await db.query.documentationGitBindings.findFirst({
    where: and(eq(bindings.teamId, teamId), ne(bindings.status, "disconnected")),
    columns: { apiSpecPath: true, apiMount: true },
  });
  return binding?.apiSpecPath ? binding.apiMount : null;
}
