import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeTestDb, seedTeam, truncateAll, type TestDb } from "../test/db";

vi.mock("../db/client", async () => ({ db: await makeTestDb() }));

import { eq } from "drizzle-orm";
import { db as testDb } from "../db/client";
import { documentChunks, documentIndexJobs, documents } from "../db/schema";
import { createDocument, publishDocument, updateDocument } from "../documents/queries";
import { upsertAiConfig } from "../ai/queries";
import { enqueuePublishedDocsForTeam } from "./index-jobs";
import { processOneDocumentIndexJob } from "./worker";

function testDbAny(db: TestDb): any {
  return db;
}

const headingDoc = {
  type: "doc" as const,
  content: [
    {
      type: "heading",
      content: [{ type: "text", text: "Installation" }],
    },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "Run npm install to get started with the CLI.",
        },
      ],
    },
  ],
};

async function drainIndexJobs() {
  while (await processOneDocumentIndexJob()) {
    // drain
  }
}

describe("document index queue", () => {
  const db = testDbAny(testDb as unknown as TestDb);
  let teamId: string;

  beforeEach(async () => {
    await truncateAll(db);
    const seeded = await seedTeam(db);
    teamId = seeded.team.id;
  });

  it("publish enqueues instead of writing chunks immediately", async () => {
    const created = await createDocument("doc", {
      teamId,
      title: "Getting Started",
    });
    await db
      .update(documents)
      .set({ draftContent: headingDoc })
      .where(eq(documents.id, created.id));
    await publishDocument("doc", teamId, created.documentId);

    const before = await db.query.documentChunks.findMany({
      where: eq(documentChunks.documentId, created.id),
    });
    expect(before).toHaveLength(0);

    const jobs = await db.query.documentIndexJobs.findMany({
      where: eq(documentIndexJobs.documentId, created.id),
    });
    expect(jobs).toHaveLength(1);
    expect(jobs[0].status).toBe("queued");
  });

  it("worker chunks and embeds a queued published doc", async () => {
    const created = await createDocument("doc", {
      teamId,
      title: "Getting Started",
    });
    await db
      .update(documents)
      .set({ draftContent: headingDoc })
      .where(eq(documents.id, created.id));
    await publishDocument("doc", teamId, created.documentId);
    await drainIndexJobs();

    const chunks = await db.query.documentChunks.findMany({
      where: eq(documentChunks.documentId, created.id),
    });
    expect(chunks).toHaveLength(1);
    expect(chunks[0].heading).toBe("Installation");

    const job = await db.query.documentIndexJobs.findFirst({
      where: eq(documentIndexJobs.documentId, created.id),
    });
    expect(job?.status).toBe("done");
  });

  it("republish coalesces to one job and indexes the latest content", async () => {
    const created = await createDocument("doc", {
      teamId,
      title: "Getting Started",
    });
    await db
      .update(documents)
      .set({ draftContent: headingDoc })
      .where(eq(documents.id, created.id));
    await publishDocument("doc", teamId, created.documentId);
    await publishDocument("doc", teamId, created.documentId);

    const jobs = await db.query.documentIndexJobs.findMany({
      where: eq(documentIndexJobs.documentId, created.id),
    });
    expect(jobs).toHaveLength(1);
    expect(jobs[0].generation).toBeGreaterThanOrEqual(2);

    await drainIndexJobs();
    const chunks = await db.query.documentChunks.findMany({
      where: eq(documentChunks.documentId, created.id),
    });
    expect(chunks).toHaveLength(1);
  });

  it("saving AI settings enqueues every published doc for the team", async () => {
    const created = await createDocument("doc", {
      teamId,
      title: "Older article",
    });
    await db
      .update(documents)
      .set({
        draftContent: headingDoc,
        content: headingDoc,
        publishedAt: new Date(),
        title: "Older article",
      })
      .where(eq(documents.id, created.id));

    const count = await enqueuePublishedDocsForTeam(teamId);
    expect(count).toBe(1);
    await drainIndexJobs();

    const chunks = await db.query.documentChunks.findMany({
      where: eq(documentChunks.documentId, created.id),
    });
    expect(chunks).toHaveLength(1);
  });

  it("upserting AI config backfills published docs", async () => {
    const created = await createDocument("doc", {
      teamId,
      title: "Pre-AI article",
    });
    await db
      .update(documents)
      .set({
        draftContent: headingDoc,
        content: headingDoc,
        publishedAt: new Date(),
        title: "Pre-AI article",
      })
      .where(eq(documents.id, created.id));

    await upsertAiConfig(teamId, {
      provider: "openai",
      apiKey: "sk-test-not-used-for-local-fallback",
    });

    const job = await db.query.documentIndexJobs.findFirst({
      where: eq(documentIndexJobs.documentId, created.id),
    });
    expect(job?.status).toBe("queued");
  });

  it("enqueue is a no-op when the team has no published docs", async () => {
    const count = await enqueuePublishedDocsForTeam(teamId);
    expect(count).toBe(0);
  });

  it("skips excluded docs on team backfill", async () => {
    const created = await createDocument("doc", {
      teamId,
      title: "Private notes",
    });
    await db
      .update(documents)
      .set({
        draftContent: headingDoc,
        content: headingDoc,
        publishedAt: new Date(),
        title: "Private notes",
        meta: { indexable: false },
        draftMeta: { indexable: false },
      })
      .where(eq(documents.id, created.id));

    expect(await enqueuePublishedDocsForTeam(teamId)).toBe(0);
  });

  it("turning off indexable on a published doc drops its chunks", async () => {
    const created = await createDocument("doc", {
      teamId,
      title: "Getting Started",
    });
    await db
      .update(documents)
      .set({ draftContent: headingDoc })
      .where(eq(documents.id, created.id));
    await publishDocument("doc", teamId, created.documentId);
    await drainIndexJobs();

    await updateDocument("doc", teamId, created.documentId, {
      meta: { indexable: false },
    });
    await drainIndexJobs();

    const chunks = await db.query.documentChunks.findMany({
      where: eq(documentChunks.documentId, created.id),
    });
    expect(chunks).toHaveLength(0);
  });

  it("does not index articles until the team enables article indexing", async () => {
    const created = await createDocument("blog", {
      teamId,
      title: "Launch post",
    });
    await db
      .update(documents)
      .set({ draftContent: headingDoc })
      .where(eq(documents.id, created.id));
    await publishDocument("blog", teamId, created.documentId);

    expect(
      await db.query.documentIndexJobs.findFirst({
        where: eq(documentIndexJobs.documentId, created.id),
      }),
    ).toBeUndefined();

    await upsertAiConfig(teamId, {
      provider: "openai",
      indexContent: { articles: true },
    });

    const job = await db.query.documentIndexJobs.findFirst({
      where: eq(documentIndexJobs.documentId, created.id),
    });
    expect(job?.status).toBe("queued");
  });
});
