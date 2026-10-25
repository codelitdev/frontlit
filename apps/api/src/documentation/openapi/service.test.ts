import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { makeTestDb, seedTeam, truncateAll, type TestDb } from "../../test/db";
vi.mock("../../db/client", async () => ({ db: await makeTestDb() }));
import { db as appDb } from "../../db/client";
import {
  documentationApiSpecs as specs,
  documentationDeliveryOutbox as outbox,
  documentationGitBindings as bindings,
  documentationSettings as settings,
} from "../../db/schema";
import type { GitTreeEntry } from "../github/importer";
import {
  getApiReferenceStatus,
  readApiOperation,
  readApiReference,
  readApiSpec,
  searchApiReference,
  syncApiReference,
} from "./service";
const db = appDb as unknown as TestDb;

const medialit = readFileSync(join(__dirname, "fixtures", "medialit.json"), "utf8");
const sha = (n: number) => String(n).padStart(40, "0");

function repo(files: Record<string, string>) {
  const blobs = new Map<string, string>();
  const entries: GitTreeEntry[] = Object.entries(files).map(([path, text]) => {
    const blob = createHash("sha1").update(text).digest("hex");
    blobs.set(blob, text);
    return { path, mode: "100644", type: "blob", sha: blob, size: text.length };
  });
  return {
    readTree: async () => entries,
    readBlob: async (blob: string) => new TextEncoder().encode(blobs.get(blob)!),
  };
}

async function seed(apiSpecPath: string | null = "apps/api/swagger.json") {
  const { account, team } = await seedTeam(db);
  const [binding] = await db
    .insert(bindings)
    .values({
      teamId: team.id,
      installationId: "7",
      repositoryId: "9",
      ownerId: "8",
      ownerLogin: "org",
      repositoryName: "docs",
      repositoryPrivate: true,
      branch: "main",
      directory: "frontlit/docs",
      status: "connected",
      grantActorAccountId: account.id,
      grantGithubUserId: "123",
      repositoryAdminVerified: true,
      capabilities: { read: true, proposals: false, directCommit: false },
      apiSpecPath,
      apiMount: "api",
    })
    .returning();
  return { team, binding: binding! };
}

describe("API reference sync", () => {
  beforeEach(async () => truncateAll(db));

  it("publishes the spec, skips it when unchanged and keeps it live on errors", async () => {
    const { team, binding } = await seed();
    await syncApiReference({
      teamId: team.id,
      binding,
      head: sha(100),
      ...repo({ "apps/api/swagger.json": medialit }),
    });
    const reference = await readApiReference(team.id);
    expect(reference?.mount).toBe("api");
    expect(reference?.groups.flatMap((g) => g.operations)).toHaveLength(11);
    const route = reference!.groups[0].operations[0].route;
    expect((await readApiOperation(team.id, route))?.operation.title).toBeTruthy();
    expect(JSON.parse((await readApiSpec(team.id))!.spec).openapi).toBe("3.0.3");
    expect(
      (await db.query.documentationDeliveryOutbox.findMany()).map((e) => e.type),
    ).toEqual(["api_reference"]);

    // Same blob: nothing is re-imported.
    const live = (await db.query.documentationSettings.findFirst())!.activeApiSpecId;
    await syncApiReference({
      teamId: team.id,
      binding,
      head: sha(101),
      ...repo({ "apps/api/swagger.json": medialit }),
    });
    expect((await db.query.documentationSettings.findFirst())!.activeApiSpecId).toBe(
      live,
    );

    // A broken spec is recorded and the live one stays.
    await syncApiReference({
      teamId: team.id,
      binding,
      head: sha(102),
      ...repo({ "apps/api/swagger.json": "{ not json" }),
    });
    const status = await getApiReferenceStatus(team.id);
    expect(status.live?.operationCount).toBe(11);
    expect(status.lastFailure?.commitSha).toBe(sha(102));
    expect(status.diagnostics[0].code).toBe("OPENAPI_PARSE");

    // A moved file is reported, not unpublished.
    await syncApiReference({
      teamId: team.id,
      binding,
      head: sha(103),
      ...repo({ "other.json": medialit }),
    });
    expect((await getApiReferenceStatus(team.id)).diagnostics[0].code).toBe(
      "OPENAPI_NOT_FOUND",
    );
    expect(await readApiReference(team.id)).not.toBeNull();
    expect(await db.select().from(specs).where(eq(specs.teamId, team.id))).toHaveLength(
      2,
    );
  });

  it("finds operations in search", async () => {
    const { team, binding } = await seed();
    await syncApiReference({
      teamId: team.id,
      binding,
      head: sha(100),
      ...repo({ "apps/api/swagger.json": medialit }),
    });
    const results = await searchApiReference(team.id, "upload file");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]).toMatchObject({ kind: "api-operation" });
    expect(results[0].url).toContain("/docs/api/");
  });

  it("does nothing without a spec path", async () => {
    const { team, binding } = await seed(null);
    await syncApiReference({
      teamId: team.id,
      binding,
      head: sha(100),
      ...repo({ "apps/api/swagger.json": medialit }),
    });
    expect(await readApiReference(team.id)).toBeNull();
    expect(await db.select().from(outbox)).toHaveLength(0);
    expect(await db.select().from(settings)).toHaveLength(0);
  });
});
