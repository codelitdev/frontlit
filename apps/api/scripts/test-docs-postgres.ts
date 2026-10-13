/* eslint-disable no-console -- operator smoke script reports PASS lines on stdout */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { resolve, join } from "node:path";
import { mkdtemp, rm, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { Pool } from "pg";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq } from "drizzle-orm";

function postgresTool(
  tool: "pg_dump" | "pg_restore",
  url: URL,
  args: string[],
  input?: Buffer,
) {
  const container = process.env.FRONTLIT_TEST_POSTGRES_CONTAINER;
  const env = {
    ...process.env,
    PGHOST: container ? "127.0.0.1" : url.hostname,
    PGPORT: container ? "5432" : url.port || "5432",
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: url.pathname.slice(1),
  };
  const command = container
    ? (process.env.FRONTLIT_TEST_DOCKER_BIN ?? "docker")
    : process.env.FRONTLIT_TEST_PG_BIN_DIR
      ? join(process.env.FRONTLIT_TEST_PG_BIN_DIR, tool)
      : tool;
  const argv = container
    ? [
        "exec",
        ...(input ? ["-i"] : []),
        container,
        tool,
        // Container mode uses the local socket of the disposable test server.
        // Explicit non-secret arguments also work through Windows Docker from WSL,
        // which does not inherit the Linux child's PG environment variables.
        `--username=${decodeURIComponent(url.username)}`,
        `--dbname=${url.pathname.slice(1)}`,
        ...args,
      ]
    : args;
  const result = spawnSync(command, argv, { env, input, maxBuffer: 64 * 1024 * 1024 });
  assert.equal(
    result.status,
    0,
    `${tool} failed; use tools matching the database server version.`,
  );
  return result.stdout;
}

async function verifyRestored() {
  const { db, pool } = await import("../src/db/client");
  try {
    const schema = await import("../src/db/schema");
    const { readDocumentation, queuePublication } = await import(
      "../src/documentation/publications"
    );
    const { getDocsSettings, saveDocumentation } = await import(
      "../src/documentation/authoring"
    );
    const teamId = process.env.DOCS_SMOKE_TEAM_ID!;
    const documentId = process.env.DOCS_SMOKE_DOCUMENT_ID!;
    assert.equal(
      await db.query.documents.findFirst({
        where: eq(schema.documents.documentId, documentId),
      }),
      undefined,
    );
    assert.equal(
      (
        await db.query.documentationRevisions.findMany({
          where: eq(schema.documentationRevisions.documentId, documentId),
        })
      ).length,
      0,
    );
    assert.equal(process.env.DOCS_RESTORE_PENDING, "true");
    await assert.rejects(readDocumentation(teamId));
    delete process.env.DOCS_RESTORE_PENDING;
    assert.equal((await readDocumentation(teamId)).items.length, 0);
    const copy = (await saveDocumentation(teamId, null, {
      title: "Resurrection attempt",
      slug: "ledger-private-guide",
      markdown: "A new copy must not publish at a purged route.",
    }))!;
    const settings = await getDocsSettings(teamId);
    await assert.rejects(
      queuePublication(teamId, {
        selected: [{ documentId: copy.documentId, expectedDraftVersion: 1 }],
        removals: [],
        expectedPublicationId: settings.activePublicationId,
        expectedDocsDraftVersion: settings.draftVersion,
        idempotencyKey: "restore-recreate",
      }),
    );
  } finally {
    await pool.end();
  }
}

async function activateFixture(crash = true, beforeActivation = false) {
  const { saveDocumentation, getDocsSettings } = await import(
    "../src/documentation/authoring"
  );
  const { queuePublication, processPublication, claimPublication, preparePublication } =
    await import("../src/documentation/publications");
  const teamId = process.env.DOCS_SMOKE_TEAM_ID!;
  const doc = (await saveDocumentation(teamId, null, {
    title: "Crash recovery fixture",
    slug: "crash-recovery",
    markdown: "Publication survived abrupt worker termination.",
  }))!;
  const settings = await getDocsSettings(teamId);
  const publication = await queuePublication(teamId, {
    selected: [{ documentId: doc.documentId, expectedDraftVersion: 1 }],
    removals: [],
    expectedPublicationId: settings.activePublicationId,
    expectedDocsDraftVersion: settings.draftVersion,
    idempotencyKey: "crash-fixture",
  });
  if (beforeActivation) {
    const claim = await claimPublication(teamId, publication.publicationId);
    assert(claim);
    assert.equal((await preparePublication(claim))?.status, "prepared");
  } else {
    assert.equal(
      (await processPublication(teamId, publication.publicationId))?.status,
      "active",
    );
  }
  // Abrupt exit after the transaction commits, before any invalidation delivery.
  if (crash) process.kill(process.pid, "SIGKILL");
  return { teamId, doc, publication };
}

async function verifyEditorWithoutGitHub() {
  const { pool } = await import("../src/db/client");
  try {
    for (const key of Object.keys(process.env))
      assert(!key.startsWith("GITHUB_DOCS_"), "GitHub configuration was not removed.");
    const { getGitHubSource } = await import("../src/documentation/github/source");
    const source = await getGitHubSource(process.env.DOCS_SMOKE_TEAM_ID!);
    assert.equal(source.configured, false);
    assert.equal(source.source, "editor");
    const { teamId, doc, publication } = await activateFixture(false);
    const { readDocumentation, searchPublishedDocumentation } = await import(
      "../src/documentation/publications"
    );
    const live = await readDocumentation(teamId);
    assert.equal(live.publicationId, publication.publicationId);
    assert.equal(live.items[0].documentId, doc.documentId);
    const results = await searchPublishedDocumentation(teamId, "Publication survived");
    assert(results.some((entry) => entry.documentId === doc.documentId));
    assert.equal((await getGitHubSource(teamId)).binding, null);
  } finally {
    await pool.end();
  }
}

// Explicit operator test: always create a fresh database, run the real migrations
// and transaction path, then drop only that generated database. No GitHub/AI calls.
async function main() {
  if (process.argv.includes("--verify-restored")) return verifyRestored();
  if (process.argv.includes("--activate-and-crash")) return activateFixture();
  if (process.argv.includes("--prepare-and-crash")) return activateFixture(true, true);
  if (process.argv.includes("--verify-editor-no-github"))
    return verifyEditorWithoutGitHub();
  const connection =
    process.env.FRONTLIT_TEST_POSTGRES_URL ?? process.env.DB_CONNECTION_STRING;
  assert(connection, "Configure FRONTLIT_TEST_POSTGRES_URL or DB_CONNECTION_STRING.");
  const name = `frontlit_docs_test_${randomUUID().replaceAll("-", "")}`;
  const testUrl = new URL(connection);
  testUrl.pathname = `/${name}`;
  const admin = new Pool({
    connectionString: connection,
    max: 1,
    connectionTimeoutMillis: 5000,
  });
  let created = false;
  let testPool: Pool | undefined;
  let restoredName: string | undefined;
  let scratch: string | undefined;
  const originalConnection = process.env.DB_CONNECTION_STRING;
  try {
    await admin.query(`CREATE DATABASE "${name}"`);
    created = true;
    process.env.DB_CONNECTION_STRING = testUrl.toString();
    process.env.INTEGRATIONS_ENCRYPTION_KEY = "isolated-postgres-smoke-key";
    const { db, pool } = await import("../src/db/client");
    testPool = pool;
    await pool.query("CREATE EXTENSION IF NOT EXISTS vector");
    await migrate(db, { migrationsFolder: resolve(process.cwd(), "drizzle") });
    const schema = await import("../src/db/schema");
    const { saveDocumentation, getDocsSettings } = await import(
      "../src/documentation/authoring"
    );
    const { queuePublication, processPublication, readDocumentation } = await import(
      "../src/documentation/publications"
    );
    const { startGitHubSetup, completeGitHubSetup } = await import(
      "../src/documentation/github/setup"
    );
    const { planGitMigration, verifyGitMigration, activateGitMigration } = await import(
      "../src/documentation/github/migrations"
    );
    const { seedTeam } = await import("../src/test/db");
    const { supportsSqlTransactions, supportsRowLocks } = await import(
      "../src/db/transaction"
    );
    assert(supportsSqlTransactions(db));
    assert(supportsRowLocks(db));

    const seed = () => seedTeam(db as any);
    const { team } = await seed();
    const draft = (await saveDocumentation(team.id, null, {
      title: "Initial",
      markdown: "Initial content",
    }))!;
    const saves = await Promise.allSettled([
      saveDocumentation(team.id, draft.documentId, {
        expectedDraftVersion: 1,
        title: "First writer",
        slug: "first-writer",
      }),
      saveDocumentation(team.id, draft.documentId, {
        expectedDraftVersion: 1,
        title: "Second writer",
        slug: "second-writer",
      }),
    ]);
    assert.equal(saves.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(saves.filter((r) => r.status === "rejected").length, 1);
    const saved = await db.query.documents.findFirst({
      where: eq(schema.documents.documentId, draft.documentId),
    });
    assert.equal(saved!.draftVersion, 2);
    assert(
      ["First writer:first-writer", "Second writer:second-writer"].includes(
        `${saved!.draftTitle}:${saved!.draftSlug}`,
      ),
    );
    console.log(
      "PASS: concurrent same-version saves use real PostgreSQL transactions without mixed fields.",
    );

    const sha = "a".repeat(40);
    const repository = {
      id: 9,
      name: "docs",
      full_name: "org/docs",
      private: true,
      default_branch: "trunk",
      owner: { id: 8, login: "org" },
      permissions: { admin: true },
    };
    const config = {
      appId: "42",
      appSlug: "test",
      clientId: "test-client",
      clientSecret: "test-secret",
      privateKey: "unused",
      callbackUrl: "http://localhost:4000/integrations/github/callback",
      webhookSecret: "test-secret",
      webOrigin: "http://localhost:3000",
    };
    const consent = {
      publishSelectedDocsPublicly: true as const,
      automaticallyPublishFuturePushes: true as const,
      delegateToWorkspacePublishers: true as const,
    };
    async function adoptionFixture() {
      const { team, account } = await seed();
      const actor = {
        teamId: team.id,
        accountId: account.id,
        authKind: "session" as const,
        isOwner: true,
        permissions: [],
        scopes: [],
        audiences: [],
      };
      const doc = (await saveDocumentation(team.id, null, {
        title: "Guide",
        slug: "guide",
        markdown: "Original live content",
      }))!;
      const s = await getDocsSettings(team.id);
      const publication = await queuePublication(team.id, {
        selected: [{ documentId: doc.documentId, expectedDraftVersion: 1 }],
        removals: [],
        expectedDocsDraftVersion: s.draftVersion,
        expectedPublicationId: s.activePublicationId,
        idempotencyKey: "initial",
      });
      assert.equal(
        (await processPublication(team.id, publication.publicationId))?.status,
        "active",
      );
      let entries: any[] = [];
      const blobs = new Map<string, Buffer>();
      let beforeHead: (() => Promise<void>) | undefined;
      const app: any = {
        exchangeCode: async () => "fake-user-token",
        user: async () => ({ id: 123, login: "admin" }),
        installations: async () => ({
          installations: [
            {
              id: 7,
              app_id: 42,
              account: { login: "org", type: "Organization" },
              suspended_at: null,
              permissions: { contents: "read" },
            },
          ],
          total_count: 1,
        }),
        repositories: async () => ({ repositories: [repository], total_count: 1 }),
        repository: async () => repository,
        repositoryById: async () => repository,
        installation: async () => ({
          id: 7,
          app_id: 42,
          suspended_at: null,
          permissions: { contents: "read" },
        }),
        installationToken: async () => ({
          token: "fake-read-token",
          expires_at: "2030-01-01T00:00:00Z",
        }),
        branchHead: async () => {
          await beforeHead?.();
          return sha;
        },
        commitTree: async () => entries,
        isAncestor: async () => true,
        findMigrationPullRequest: async () => ({
          number: 2,
          headSha: sha,
          merged: true,
          mergeCommitSha: sha,
        }),
        blob: async (_token: string, _owner: string, _repo: string, id: string) =>
          blobs.get(id),
      };
      const setup = await startGitHubSetup(team.id, actor, {}, config);
      await completeGitHubSetup(
        new URL(setup.authorizationUrl).searchParams.get("state")!,
        "fake-code",
        config,
        app,
      );
      const current = await getDocsSettings(team.id);
      const plan = await planGitMigration(
        team.id,
        actor,
        {
          setupId: setup.setupId,
          installationId: 7,
          repositoryId: 9,
          branch: "trunk",
          directory: "docs",
          expectedDocsDraftVersion: current.draftVersion,
          expectedPublicationId: current.activePublicationId,
        },
        config,
        app,
      );
      // Setup adoption requires the platform-created setup PR; seed its merged
      // record as the setup-PR worker would after GitHub acknowledged it.
      await db.insert(schema.documentationGitMigrationPrs).values({
        planId: plan.planId,
        teamId: team.id,
        setupId: setup.setupId,
        actorCredential: {
          kind: "session",
          accountId: account.id,
          sessionId: "fixture",
          membershipId: "fixture",
        },
        idempotencyKey: plan.planId,
        inputHash: plan.planHash,
        policyEpoch: current.policyEpoch,
        purgeGeneration: current.purgeGeneration,
        ownerId: "8",
        branch: `frontlit/docs-setup/${plan.planId}`,
        status: "open",
        commitSha: sha,
        pullRequestNumber: 2,
        pullRequestUrl: "https://github.com/org/docs/pull/2",
      } as any);
      entries = [{ path: "docs", mode: "040000", type: "tree", sha }];
      for (const [i, file] of plan.files.entries()) {
        const id = (i + 1).toString(16).padStart(40, "0");
        entries.push({ path: file.path, mode: "100644", type: "blob", sha: id });
        blobs.set(id, Buffer.from(file.markdown));
      }
      const verified = await verifyGitMigration(
        team.id,
        actor,
        plan.planId,
        {},
        config,
        app,
      );
      assert.equal(verified.verified, true);
      const activate = () =>
        activateGitMigration(
          team.id,
          actor,
          plan.planId,
          {
            commitSha: sha,
            planHash: plan.planHash,
            expectedDocsDraftVersion: plan.docsDraftVersion,
            expectedPublicationId: plan.activePublicationId,
            idempotencyKey: "adopt",
            consent,
          },
          config,
          app,
        );
      return {
        teamId: team.id,
        doc,
        plan,
        activate,
        setBeforeHead: (hook: () => Promise<void>) => {
          beforeHead = hook;
        },
      };
    }

    // Hold activation after its external proof, let an actual concurrent save win
    // its settings lock, then prove the activation transaction rejects stale input.
    const edited = await adoptionFixture();
    let entered!: () => void;
    let resume!: () => void;
    const reached = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const released = new Promise<void>((resolve) => {
      resume = resolve;
    });
    edited.setBeforeHead(async () => {
      entered();
      await released;
    });
    const pending = edited.activate();
    await Promise.race([
      reached,
      pending.then(() => {
        throw new Error("Activation completed before the race barrier.");
      }),
    ]);
    await saveDocumentation(edited.teamId, edited.doc.documentId, {
      expectedDraftVersion: 1,
      title: "Concurrent local edit",
    });
    resume();
    await assert.rejects(pending, (e: any) => e.code === "MIGRATION_STALE");
    assert.equal((await getDocsSettings(edited.teamId)).source, "editor");
    assert.equal(
      await db.query.documentationGitBindings.findFirst({
        where: eq(schema.documentationGitBindings.teamId, edited.teamId),
      }),
      undefined,
    );
    assert.equal(
      (await db.query.documents.findFirst({
        where: eq(schema.documents.documentId, edited.doc.documentId),
      }))!.draftTitle,
      "Concurrent local edit",
    );
    console.log(
      "PASS: a concurrent local save makes reviewed adoption stale without overwriting editor work.",
    );

    const adopted = await adoptionFixture();
    await adopted.activate();
    await saveDocumentation(adopted.teamId, adopted.doc.documentId, {
      expectedDraftVersion: 1,
      title: "New Git proposal draft",
    });
    const adoptedDoc = (await db.query.documents.findFirst({
      where: eq(schema.documents.documentId, adopted.doc.documentId),
    }))!;
    assert.equal((await getDocsSettings(adopted.teamId)).source, "git");
    assert.equal(adoptedDoc.draftVersion, 2);
    assert.equal(adoptedDoc.draftGitSource?.base?.commitSha, sha);
    assert.equal((await readDocumentation(adopted.teamId)).items[0].title, "Guide");
    console.log(
      "PASS: adoption followed by a save uses Git provenance and preserves accepted public content.",
    );
    const { enqueueGitSync } = await import("../src/documentation/github/state");
    const { claimGitSync } = await import("../src/documentation/github/worker");
    await enqueueGitSync(adopted.teamId);
    const claims = await Promise.all([
      claimGitSync(adopted.teamId),
      claimGitSync(adopted.teamId),
    ]);
    assert.equal(claims.filter(Boolean).length, 1);
    assert.equal(claims.find(Boolean)!.attempts, 1);
    console.log(
      "PASS: concurrent PostgreSQL workers claim the queued sync exactly once.",
    );
    if (process.argv.includes("--tenant-burst")) {
      // V45 at database scope: a webhook burst per tenant coalesces to one
      // queued sync, and concurrent global workers claim each tenant once.
      const tenants = await Promise.all([1, 2, 3, 4].map(() => adoptionFixture()));
      for (const tenant of tenants) await tenant.activate();
      const before = new Map<string, number>();
      for (const tenant of tenants) {
        const binding = await db.query.documentationGitBindings.findFirst({
          where: eq(schema.documentationGitBindings.teamId, tenant.teamId),
        });
        before.set(tenant.teamId, binding!.requestedGeneration);
      }
      const burst = await Promise.allSettled(
        tenants.flatMap((tenant) =>
          Array.from({ length: 20 }, () =>
            enqueueGitSync(tenant.teamId, { trigger: "webhook" }),
          ),
        ),
      );
      assert.equal(burst.filter((r) => r.status === "rejected").length, 0);
      for (const tenant of tenants) {
        const rows = await db.query.documentationGitJobs.findMany({
          where: eq(schema.documentationGitJobs.teamId, tenant.teamId),
        });
        const queued = rows.filter((row) => row.status === "queued");
        assert.equal(queued.length, 1, "burst must coalesce to one queued sync");
        const binding = await db.query.documentationGitBindings.findFirst({
          where: eq(schema.documentationGitBindings.teamId, tenant.teamId),
        });
        assert.equal(binding!.requestedGeneration, before.get(tenant.teamId)! + 20);
        assert.equal(queued[0].requestGeneration, binding!.requestedGeneration);
      }
      const claimed = await Promise.all(
        Array.from({ length: 8 }, () => claimGitSync()),
      );
      const teams = claimed.filter(Boolean).map((job) => job!.teamId);
      assert.equal(teams.length, 4);
      assert.deepEqual(
        [...new Set(teams)].sort(),
        tenants.map((tenant) => tenant.teamId).sort(),
      );
      console.log(
        "PASS: 80 concurrent webhook enqueues across four tenants coalesce to one current sync each; eight concurrent workers claim every tenant exactly once.",
      );
    }
    if (process.argv.includes("--adoption-transport-race")) {
      // V43 over the real HTTP stack: production auth/policy/REST and MCP SDK
      // routes race reviewed adoption on the same PostgreSQL database.
      const { createApp } = await import("../src/app");
      const { createApiKey } = await import("../src/apikey/queries");
      const { Client, StreamableHTTPClientTransport } = await import(
        "@modelcontextprotocol/client"
      );
      const server = createApp().listen(0, "127.0.0.1");
      await new Promise((resolve) => server.once("listening", resolve));
      const origin = `http://127.0.0.1:${(server.address() as any).port}`;
      try {
        const transports = async (teamId: string, documentId: string) => {
          const { secret } = await createApiKey(teamId, "v43-race");
          const headers = { "x-frontlit-apikey": secret };
          const rest = (title: string) =>
            fetch(`${origin}/content/documentation/${documentId}`, {
              method: "PATCH",
              headers: { ...headers, "content-type": "application/json" },
              body: JSON.stringify({ expectedDraftVersion: 1, title }),
            });
          const client = new Client({ name: "v43-race", version: "1" });
          await client.connect(
            new StreamableHTTPClientTransport(new URL(`${origin}/mcp`), {
              requestInit: { headers },
            }),
          );
          const mcp = (title: string) =>
            client.callTool({
              name: "update_documentation_page",
              arguments: { documentId, expectedDraftVersion: 1, title },
            });
          return { rest, mcp, close: () => client.close() };
        };
        const state = async (teamId: string, documentId: string) => ({
          source: (await getDocsSettings(teamId)).source,
          binding: await db.query.documentationGitBindings.findFirst({
            where: eq(schema.documentationGitBindings.teamId, teamId),
          }),
          doc: (await db.query.documents.findFirst({
            where: eq(schema.documents.documentId, documentId),
          }))!,
        });

        // Barrier: activation holds after its provider proof while REST and MCP
        // race each other and the adoption for the same draft version.
        const held = await adoptionFixture();
        const t = await transports(held.teamId, held.doc.documentId);
        let entered!: () => void;
        let resume!: () => void;
        const reached = new Promise<void>((r) => (entered = r));
        const released = new Promise<void>((r) => (resume = r));
        held.setBeforeHead(async () => {
          entered();
          await released;
        });
        const pending = held.activate();
        await reached;
        const [restResponse, mcpResult] = await Promise.all([
          t.rest("REST transport edit"),
          t.mcp("MCP transport edit"),
        ]);
        await t.close();
        const restWon = restResponse.status === 200;
        assert.equal(restResponse.status, restWon ? 200 : 409);
        assert.equal(Boolean(mcpResult.isError), restWon);
        resume();
        await assert.rejects(pending, (e: any) => e.code === "MIGRATION_STALE");
        const afterHeld = await state(held.teamId, held.doc.documentId);
        assert.equal(afterHeld.source, "editor");
        assert.equal(afterHeld.binding, undefined);
        assert.equal(afterHeld.doc.draftVersion, 2);
        assert.equal(
          afterHeld.doc.draftTitle,
          restWon ? "REST transport edit" : "MCP transport edit",
        );
        assert.equal(afterHeld.doc.draftGitSource ?? null, null);
        assert.equal((await readDocumentation(held.teamId)).items[0].title, "Guide");
        console.log(
          `PASS: authenticated REST/MCP saves race held adoption; ${restWon ? "REST" : "MCP"} wins, the other is stale and adoption rejects without a binding.`,
        );

        // Unsynchronized races: whichever commits first, the result is never a
        // hybrid source and editor work is never overwritten.
        const outcomes: string[] = [];
        for (let i = 0; i < 6; i++) {
          const race = await adoptionFixture();
          const r = await transports(race.teamId, race.doc.documentId);
          const [activation, save] = await Promise.allSettled([
            race.activate(),
            i % 2 ? r.mcp("Racing edit") : r.rest("Racing edit"),
          ]);
          await r.close();
          const saved =
            save.status === "fulfilled" &&
            ("status" in save.value ? save.value.status === 200 : !save.value.isError);
          const after = await state(race.teamId, race.doc.documentId);
          assert.equal(after.source === "git", Boolean(after.binding));
          if (activation.status === "fulfilled") {
            assert.equal(after.source, "git");
            if (saved) {
              // Save followed activation: it carries Git provenance.
              assert.equal(after.doc.draftTitle, "Racing edit");
              assert.equal(after.doc.draftGitSource?.base?.commitSha, sha);
            } else {
              assert.equal(after.doc.draftTitle, "Guide");
            }
          } else {
            assert.equal((activation.reason as any).code, "MIGRATION_STALE");
            assert.equal(after.source, "editor");
            assert(saved, "Adoption may only become stale because the save committed.");
            assert.equal(after.doc.draftTitle, "Racing edit");
            assert.equal(after.doc.draftGitSource ?? null, null);
          }
          assert.equal((await readDocumentation(race.teamId)).items[0].title, "Guide");
          outcomes.push(
            `${i % 2 ? "mcp" : "rest"}:${activation.status === "fulfilled" ? "adopted" : "stale"}:${saved ? "saved" : "rejected"}`,
          );
        }
        console.log(
          `PASS: unsynchronized authenticated transport/adoption races stay single-source (${outcomes.join(", ")}).`,
        );
      } finally {
        await new Promise((resolve) => server.close(resolve));
      }
    }
    if (process.argv.includes("--editor-no-github")) {
      const { team } = await seed();
      const env = { ...process.env, DOCS_SMOKE_TEAM_ID: team.id };
      for (const key of Object.keys(env))
        if (key.startsWith("GITHUB_DOCS_")) delete env[key as keyof typeof env];
      const child = spawnSync(
        process.execPath,
        [
          "--import",
          "tsx",
          "scripts/test-docs-postgres.ts",
          "--verify-editor-no-github",
        ],
        { env, timeout: 30000, maxBuffer: 1024 * 1024 },
      );
      assert.equal(
        child.status,
        0,
        "Editor-only process failed with GitHub unconfigured.",
      );
      console.log(
        "PASS: a fresh process with all GitHub App configuration removed saves, publishes, serves and lexically searches editor documentation without a Git binding.",
      );
    }
    if (process.argv.includes("--outbox-crash")) {
      const before = await seed();
      const old = (await saveDocumentation(before.team.id, null, {
        title: "Last good publication",
        slug: "last-good",
        markdown: "Keep this live while a worker crashes before activation.",
      }))!;
      const oldSettings = await getDocsSettings(before.team.id);
      const oldPublication = await queuePublication(before.team.id, {
        selected: [{ documentId: old.documentId, expectedDraftVersion: 1 }],
        removals: [],
        expectedPublicationId: null,
        expectedDocsDraftVersion: oldSettings.draftVersion,
        idempotencyKey: "old-live",
      });
      assert.equal(
        (await processPublication(before.team.id, oldPublication.publicationId))
          ?.status,
        "active",
      );
      const preparingChild = spawnSync(
        process.execPath,
        ["--import", "tsx", "scripts/test-docs-postgres.ts", "--prepare-and-crash"],
        {
          env: { ...process.env, DOCS_SMOKE_TEAM_ID: before.team.id },
          timeout: 30000,
          maxBuffer: 1024 * 1024,
        },
      );
      assert.equal(
        preparingChild.signal,
        "SIGKILL",
        "Preparation child did not reach its crash boundary.",
      );
      assert.equal(
        (await getDocsSettings(before.team.id)).activePublicationId,
        oldPublication.publicationId,
      );
      assert.deepEqual(
        (await readDocumentation(before.team.id)).items.map((d) => d.slug),
        ["last-good"],
      );
      const candidates = await db.query.documentationPublications.findMany({
        where: eq(schema.documentationPublications.teamId, before.team.id),
      });
      const prepared = candidates.find((candidate) => candidate.status === "prepared");
      assert(prepared && !prepared.activatedAt && prepared.leaseExpiresAt);
      // Advance only the disposable job's lease to emulate downtime expiry.
      await db
        .update(schema.documentationPublications)
        .set({ leaseExpiresAt: new Date(0), nextAttemptAt: new Date(0) })
        .where(
          eq(schema.documentationPublications.publicationId, prepared.publicationId),
        );
      assert.equal(
        (await processPublication(before.team.id, prepared.publicationId))?.status,
        "active",
      );
      assert.equal(
        (await getDocsSettings(before.team.id)).activePublicationId,
        prepared.publicationId,
      );
      assert(
        (await readDocumentation(before.team.id)).items.some(
          (d) => d.slug === "crash-recovery",
        ),
      );
      assert.equal(
        await processPublication(before.team.id, prepared.publicationId),
        null,
      );
      const recoveredEvents = await db.query.documentationDeliveryOutbox.findMany({
        where: eq(
          schema.documentationDeliveryOutbox.publicationId,
          prepared.publicationId,
        ),
      });
      assert.equal(
        recoveredEvents.filter((event) => event.type === "activation").length,
        1,
      );
      console.log(
        "PASS: SIGKILL before activation preserves last-good content; expiry reclaim activates the captured publication once with one durable event.",
      );
      const { team } = await seed();
      const webhookSecret = "disposable-delivery-test-secret";
      const child = spawnSync(
        process.execPath,
        ["--import", "tsx", "scripts/test-docs-postgres.ts", "--activate-and-crash"],
        {
          env: {
            ...process.env,
            DOCS_SMOKE_TEAM_ID: team.id,
            REVALIDATE_WEBHOOK_SECRET: webhookSecret,
          },
          maxBuffer: 1024 * 1024,
          timeout: 30000,
        },
      );
      assert.equal(
        child.signal,
        "SIGKILL",
        "Activation child did not reach its crash boundary.",
      );
      const settings = await getDocsSettings(team.id);
      assert(settings.activePublicationId);
      assert.equal((await readDocumentation(team.id)).items[0].slug, "crash-recovery");
      const outbox = schema.documentationDeliveryOutbox;
      const event = await db.query.documentationDeliveryOutbox.findFirst({
        where: eq(outbox.teamId, team.id),
      });
      assert(event && !event.completedAt);
      assert.deepEqual(event.acknowledgments, []);
      assert.deepEqual(event.destinations, ["local", "sites"]);
      // Other isolated fixtures are not part of this delivery assertion.
      await db.update(outbox).set({ completedAt: new Date() });
      await db
        .update(outbox)
        .set({ completedAt: null, nextAttemptAt: new Date(0) })
        .where(eq(outbox.eventId, event.eventId));
      const { verifyWebhookSignature } = await import(
        "../src/services/webhook-signing"
      );
      const receipts: string[] = [];
      const server = createServer(async (request, response) => {
        try {
          let raw = "";
          for await (const chunk of request) raw += chunk.toString();
          assert.equal(request.url, "/api/webhooks/documentation");
          assert.equal(request.method, "POST");
          assert(
            verifyWebhookSignature(
              webhookSecret,
              raw,
              Number(request.headers["x-frontlit-timestamp"]),
              String(request.headers["x-frontlit-signature"]),
            ),
          );
          const payload = JSON.parse(raw);
          assert.equal(payload.eventId, event.eventId);
          assert.equal(payload.teamId, team.teamId);
          assert.equal(payload.publicationId, settings.activePublicationId);
          receipts.push(raw);
          // The first real HTTP delivery fails; the next accepts the same event.
          response.writeHead(receipts.length === 1 ? 503 : 200).end();
        } catch {
          response.writeHead(400).end();
        }
      });
      const previousBase = process.env.SITES_BASE_URL;
      const previousSecret = process.env.REVALIDATE_WEBHOOK_SECRET;
      try {
        await new Promise<void>((resolve, reject) => {
          server.once("error", reject);
          server.listen(0, "127.0.0.1", resolve);
        });
        const address = server.address();
        assert(address && typeof address !== "string");
        process.env.SITES_BASE_URL = `http://127.0.0.1:${address.port}`;
        process.env.REVALIDATE_WEBHOOK_SECRET = webhookSecret;
        const { deliverDocumentationEvent } = await import(
          "../src/documentation/publications"
        );
        assert(await deliverDocumentationEvent());
        const pending = await db.query.documentationDeliveryOutbox.findFirst({
          where: eq(outbox.eventId, event.eventId),
        });
        assert.deepEqual(pending!.acknowledgments, ["local"]);
        assert.equal(pending!.completedAt, null);
        assert.equal(
          (await getDocsSettings(team.id)).activePublicationId,
          settings.activePublicationId,
        );
        await db
          .update(outbox)
          .set({ nextAttemptAt: new Date(0) })
          .where(eq(outbox.eventId, event.eventId));
        assert(await deliverDocumentationEvent());
        const delivered = await db.query.documentationDeliveryOutbox.findFirst({
          where: eq(outbox.eventId, event.eventId),
        });
        assert(delivered!.completedAt);
        assert.deepEqual(delivered!.acknowledgments, ["local", "sites"]);
        assert.equal(delivered!.attempts, 2);
        assert.equal(receipts.length, 2);
        assert.equal(receipts[0], receipts[1]);
        assert.equal(await deliverDocumentationEvent(), false);
        assert.equal(
          (await readDocumentation(team.id)).items[0].slug,
          "crash-recovery",
        );
      } finally {
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        );
        if (previousBase === undefined) delete process.env.SITES_BASE_URL;
        else process.env.SITES_BASE_URL = previousBase;
        if (previousSecret === undefined) delete process.env.REVALIDATE_WEBHOOK_SECRET;
        else process.env.REVALIDATE_WEBHOOK_SECRET = previousSecret;
      }
      console.log(
        "PASS: SIGKILL after activation preserves the publication and durable outbox; signed HTTP failure/retry retains acknowledgments and settles the original event.",
      );
    }
    if (process.argv.includes("--backup-restore")) {
      scratch = await mkdtemp(join(tmpdir(), "frontlit-pg-ledger-"));
      process.env.DOCS_DELETION_LEDGER_DIR = scratch;
      const { team, account } = await seed();
      const secret = "PRIVATE POSTGRES BACKUP FIXTURE BODY";
      const doc = (await saveDocumentation(team.id, null, {
        title: "Private fixture",
        slug: "ledger-private-guide",
        markdown: secret,
      }))!;
      const settings = await getDocsSettings(team.id);
      const publication = await queuePublication(team.id, {
        selected: [{ documentId: doc.documentId, expectedDraftVersion: 1 }],
        removals: [],
        expectedPublicationId: null,
        expectedDocsDraftVersion: settings.draftVersion,
        idempotencyKey: "ledger-initial",
      });
      assert.equal(
        (await processPublication(team.id, publication.publicationId))?.status,
        "active",
      );
      const { preflightPurge, commitPurge } = await import(
        "../src/documentation/publications"
      );
      const plan = await preflightPurge(team.id, [doc.documentId], account.id);
      const backup = postgresTool("pg_dump", testUrl, [
        "--format=custom",
        "--no-owner",
        "--no-privileges",
      ]);
      await commitPurge(
        team.id,
        {
          planId: plan.purgeId,
          planHash: plan.planHash,
          acknowledgment: "irreversible-deletion",
          idempotencyKey: "ledger-purge",
        },
        {
          accountId: account.id,
          isOwner: true,
          authKind: "session",
          sessionAuthenticatedAt: new Date(),
        },
      );
      const records = (await readdir(scratch)).filter((file) => file.endsWith(".json"));
      assert.equal(records.length, 1);
      assert(!(await readFile(join(scratch, records[0]), "utf8")).includes(secret));
      restoredName = `${name}_restore`;
      await admin.query(`CREATE DATABASE "${restoredName}"`);
      const restoredUrl = new URL(testUrl);
      restoredUrl.pathname = `/${restoredName}`;
      postgresTool(
        "pg_restore",
        restoredUrl,
        [
          "--no-owner",
          "--no-privileges",
          "--exit-on-error",
          "--clean",
          "--if-exists",
          "--dbname",
          restoredName,
        ],
        backup,
      );
      const check = new Pool({ connectionString: restoredUrl.toString() });
      try {
        const rows = await check.query(
          "select draft_markdown from documents where document_id=$1",
          [doc.documentId],
        );
        assert(rows.rows[0].draft_markdown.includes(secret));
      } finally {
        await check.end();
      }
      const env = {
        ...process.env,
        DB_CONNECTION_STRING: restoredUrl.toString(),
        DOCS_RESTORE_PENDING: "true",
        DOCS_SMOKE_TEAM_ID: team.id,
        DOCS_SMOKE_DOCUMENT_ID: doc.documentId,
      };
      const replay = spawnSync(
        process.execPath,
        ["--import", "tsx", "src/documentation/deletion-ledger-cli.ts", "replay"],
        { env, encoding: "utf8", maxBuffer: 1024 * 1024 },
      );
      assert.equal(
        replay.status,
        0,
        "Deletion-ledger CLI failed on the restored test database.",
      );
      assert.match(replay.stdout, /"applied":1/);
      const verify = spawnSync(
        process.execPath,
        ["--import", "tsx", "scripts/test-docs-postgres.ts", "--verify-restored"],
        { env, encoding: "utf8", maxBuffer: 1024 * 1024 },
      );
      assert.equal(
        verify.status,
        0,
        "Restored content/serving/resurrection verification failed.",
      );
      console.log(
        "PASS: real pg_dump/pg_restore resurrects old content; independent CLI replay erases it, retains maintenance mode and prevents publication at the purged route.",
      );
    }
  } finally {
    try {
      await testPool?.end();
    } finally {
      try {
        if (restoredName) await admin.query(`DROP DATABASE "${restoredName}"`);
        if (created) await admin.query(`DROP DATABASE "${name}"`);
      } finally {
        await admin.end();
        if (originalConnection === undefined) delete process.env.DB_CONNECTION_STRING;
        else process.env.DB_CONNECTION_STRING = originalConnection;
      }
    }
    if (scratch) await rm(scratch, { recursive: true, force: true });
    console.log("Disposable PostgreSQL database cleanup completed.");
  }
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "PostgreSQL documentation smoke failed.",
  );
  process.exitCode = 1;
});
