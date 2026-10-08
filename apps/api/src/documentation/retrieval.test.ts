import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeTestDb, seedTeam, type TestDb } from "../test/db";
vi.mock("../db/client", async () => ({ db: await makeTestDb() }));
vi.mock("../ai/embeddings", () => ({ getRealEmbeddings: vi.fn() }));
import { db as appDb } from "../db/client";
import { upsertAiConfig } from "../ai/queries";
import { aiSettings } from "../db/schema";
import { getRealEmbeddings } from "../ai/embeddings";
import { getDocsSettings, saveDocumentation, updateDocsSettings } from "./authoring";
import {
  queuePublication,
  processPublication,
  readDocumentation,
  searchPublishedDocumentation,
} from "./publications";
import { documentationPublications, aiUsageDaily } from "../db/schema";
import { eq } from "drizzle-orm";
const db = appDb as unknown as TestDb;
const vector = () => [1, ...Array(1535).fill(0)];
describe("D5 immutable semantic retrieval and last-good publication", () => {
  let teamId: string, initialId: string;
  beforeEach(async () => {
    teamId = (await seedTeam(db)).team.id;
    vi.mocked(getRealEmbeddings)
      .mockReset()
      .mockImplementation(async (texts) => ({
        embeddings: texts.map(vector),
        usedTokens: 7,
      }));
    const doc = (await saveDocumentation(teamId, null, {
      title: "Reset keys",
      slug: "reset-keys",
      markdown: "## Reset\n\nRotate keys in account settings.",
    }))!;
    const s = await getDocsSettings(teamId);
    const job = await queuePublication(teamId, {
      selected: [
        { documentId: doc.documentId, expectedDraftVersion: doc.draftVersion },
      ],
      removals: [],
      expectedPublicationId: s.activePublicationId,
      expectedDocsDraftVersion: s.draftVersion,
      idempotencyKey: "initial",
    });
    await processPublication(teamId);
    initialId = job.publicationId;
  });
  async function semantic() {
    const s = await getDocsSettings(teamId);
    await updateDocsSettings(teamId, {
      expectedDocsDraftVersion: s.draftVersion,
      indexing: { enabled: true, mode: "semantic" },
    });
    return (
      await db.query.documentationPublications.findMany({
        where: eq(documentationPublications.teamId, teamId),
      })
    ).find((p) => p.status === "queued")!;
  }
  it("publishes and searches lexically without calling a provider", async () => {
    expect(getRealEmbeddings).not.toHaveBeenCalled();
    const hit = (await searchPublishedDocumentation(teamId, "rotate keys"))[0];
    expect(hit).toMatchObject({
      publicationId: initialId,
      revisionId: expect.any(String),
      evidenceId: expect.any(String),
      url: expect.stringContaining("/docs/reset-keys"),
    });
  });
  it("fails semantic preparation without credentials and keeps lexical publication usable", async () => {
    const job = await semantic();
    await processPublication(teamId);
    expect(await readDocumentation(teamId)).toMatchObject({ publicationId: initialId });
    expect(
      await db.query.documentationPublications.findFirst({
        where: eq(documentationPublications.publicationId, job.publicationId),
      }),
    ).toMatchObject({
      status: "failed",
      diagnostics: [
        expect.objectContaining({ code: "EMBEDDING_CONFIGURATION_REQUIRED" }),
      ],
    });
    expect(getRealEmbeddings).not.toHaveBeenCalled();
    expect(await searchPublishedDocumentation(teamId, "rotate keys")).toHaveLength(1);
  });
  it("captures encrypted provider configuration, settles actual usage and scopes semantic results", async () => {
    await upsertAiConfig(teamId, {
      provider: "openai",
      apiKey: "test-key",
      embedding: {
        provider: "openai",
        apiKey: "test-key",
        deployment: "text-embedding-3-small",
      },
    });
    const job = await semantic();
    expect(job.indexing.configHash).toEqual(expect.any(String));
    const result = await processPublication(teamId);
    expect(result?.diagnostics).toEqual([]);
    expect(result).toMatchObject({ status: "active" });
    expect((await readDocumentation(teamId)).publicationId).toBe(job.publicationId);
    await db.delete(aiSettings).where(eq(aiSettings.teamId, teamId));
    const hit = (await searchPublishedDocumentation(teamId, "reset"))[0];
    expect(hit.publicationId).toBe(job.publicationId);
    const usage = (await db.query.aiUsageDaily.findFirst({
      where: eq(aiUsageDaily.teamId, teamId),
    }))!;
    expect(usage.reservedTokens).toBe(0);
    expect(usage.usedTokens).toBe(14);
    const before = vi.mocked(getRealEmbeddings).mock.calls.length;
    expect(
      await searchPublishedDocumentation((await seedTeam(db)).team.id, "reset"),
    ).toEqual([]);
    expect(getRealEmbeddings).toHaveBeenCalledTimes(before);
  });
  it("queues a new generation on provider rotation while old retrieval stays usable", async () => {
    await upsertAiConfig(teamId, {
      provider: "openai",
      apiKey: "old-key",
      embedding: {
        provider: "openai",
        apiKey: "old-key",
        deployment: "text-embedding-3-small",
      },
    });
    const first = await semantic();
    await processPublication(teamId);
    await upsertAiConfig(teamId, {
      provider: "openai",
      apiKey: "new-key",
      embedding: {
        provider: "openai",
        apiKey: "new-key",
        deployment: "text-embedding-3-small",
      },
    });
    const pending = (
      await db.query.documentationPublications.findMany({
        where: eq(documentationPublications.teamId, teamId),
      })
    ).find((p) => p.status === "queued")!;
    expect(pending.generation).toBeGreaterThan(first.generation);
    expect(pending.indexing.configHash).not.toBe(first.indexing.configHash);
    expect((await searchPublishedDocumentation(teamId, "reset"))[0].publicationId).toBe(
      first.publicationId,
    );
    expect(vi.mocked(getRealEmbeddings).mock.calls.at(-1)?.[1].apiKey).toBe("old-key");
    await processPublication(teamId);
    expect((await readDocumentation(teamId)).publicationId).toBe(pending.publicationId);
  });
  it("makes budget exhaustion terminal without automatically retrying provider work", async () => {
    await upsertAiConfig(teamId, { provider: "openai", apiKey: "test-key" });
    vi.stubEnv("INBOX_AI_DAILY_TOKEN_BUDGET", "1");
    try {
      const job = await semantic();
      const result = await processPublication(teamId);
      expect(result).toMatchObject({
        status: "failed",
        diagnostics: [expect.objectContaining({ code: "BUDGET_EXHAUSTED" })],
      });
      expect(await processPublication(teamId, job.publicationId)).toBeNull();
      expect(getRealEmbeddings).not.toHaveBeenCalled();
      expect((await readDocumentation(teamId)).publicationId).toBe(initialId);
    } finally {
      vi.unstubAllEnvs();
    }
  });
  it("resumes bounded preparation without double-charging completed revisions", async () => {
    await upsertAiConfig(teamId, { provider: "openai", apiKey: "test-key" });
    await semantic();
    const selected = [];
    for (let i = 0; i < 5; i++) {
      const doc = (await saveDocumentation(teamId, null, {
        title: `Additional ${i}`,
        slug: `additional-${i}`,
        markdown: `## Setup\n\nAdditional setup ${i}.`,
      }))!;
      selected.push({
        documentId: doc.documentId,
        expectedDraftVersion: doc.draftVersion,
      });
    }
    const settings = await getDocsSettings(teamId);
    const job = await queuePublication(teamId, {
      selected,
      removals: [],
      expectedPublicationId: settings.activePublicationId,
      expectedDocsDraftVersion: settings.draftVersion,
      idempotencyKey: "bounded",
    });
    expect(await processPublication(teamId, job.publicationId)).toMatchObject({
      status: "queued",
      attempts: 0,
      diagnostics: [],
    });
    expect(getRealEmbeddings).toHaveBeenCalledTimes(5);
    expect((await readDocumentation(teamId)).publicationId).toBe(initialId);
    await db
      .update(documentationPublications)
      .set({ nextAttemptAt: new Date(0) })
      .where(eq(documentationPublications.publicationId, job.publicationId));
    expect(await processPublication(teamId, job.publicationId)).toMatchObject({
      status: "active",
    });
    expect(getRealEmbeddings).toHaveBeenCalledTimes(6);
    expect(
      (await db.query.aiUsageDaily.findFirst({
        where: eq(aiUsageDaily.teamId, teamId),
      }))!.usedTokens,
    ).toBe(42);
  });
  it("rejects invalid vectors without replacing the live publication", async () => {
    await upsertAiConfig(teamId, {
      provider: "openai",
      apiKey: "test-key",
      embedding: {
        provider: "openai",
        apiKey: "test-key",
        deployment: "text-embedding-3-small",
      },
    });
    vi.mocked(getRealEmbeddings).mockResolvedValue({
      embeddings: [[0]],
      usedTokens: 2,
    });
    await semantic();
    await processPublication(teamId);
    expect((await readDocumentation(teamId)).publicationId).toBe(initialId);
    expect(
      (await db.query.aiUsageDaily.findFirst({
        where: eq(aiUsageDaily.teamId, teamId),
      }))!.reservedTokens,
    ).toBe(0);
  });
});
