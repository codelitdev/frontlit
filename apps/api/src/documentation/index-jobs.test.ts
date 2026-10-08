import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeTestDb, seedTeam, truncateAll, type TestDb } from "../test/db";

vi.mock("../db/client", async () => ({ db: await makeTestDb() }));

import { eq } from "drizzle-orm";
import { db as testDb } from "../db/client";
import { documentChunks, documentIndexJobs, documents } from "../db/schema";
import { createDocument, publishDocument, updateDocument } from "../documents/queries";
import { upsertAiConfig } from "../ai/queries";
import { enqueuePublishedDocsForTeam } from "./index-jobs";
import { getDocsSettings } from "./authoring";
import {
  queuePublication,
  processPublication,
  readDocumentation,
  searchPublishedDocumentation,
} from "./publications";
import { processOneDocumentIndexJob } from "./worker";

function testDbAny(db: TestDb): any {
  return db;
}

const headingDoc = {
  type: "doc" as const,
  content: [
    {
      type: "heading",
      attrs: { level: 2 },
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

  it("captures documentation in a publication job before exposing chunks", async () => {
    const created = await createDocument("doc", { teamId, title: "Getting Started" });
    await db
      .update(documents)
      .set({ draftContent: headingDoc })
      .where(eq(documents.id, created.id));
    const settings = await getDocsSettings(teamId);
    const job = await queuePublication(teamId, {
      selected: [{ documentId: created.documentId, expectedDraftVersion: 1 }],
      removals: [],
      expectedPublicationId: settings.activePublicationId,
      expectedDocsDraftVersion: settings.draftVersion,
      idempotencyKey: "queued-doc",
    });
    expect(job.status).toBe("queued");
    expect((await readDocumentation(teamId)).items).toEqual([]);
    expect(await searchPublishedDocumentation(teamId, "Installation")).toEqual([]);
    expect(await db.query.documentIndexJobs.findMany()).toEqual([]);
    await processPublication(teamId, job.publicationId);
    expect(
      (await searchPublishedDocumentation(teamId, "Installation"))[0].heading,
    ).toBe("Installation");
  });

  it("single-document publication prepares immutable chunks before activation", async () => {
    const created = await createDocument("doc", { teamId, title: "Getting Started" });
    await db
      .update(documents)
      .set({ draftContent: headingDoc })
      .where(eq(documents.id, created.id));
    await publishDocument("doc", teamId, created.documentId, 1);
    expect(
      (await searchPublishedDocumentation(teamId, "Installation"))[0],
    ).toMatchObject({
      heading: "Installation",
      documentId: created.documentId,
    });
    expect(await db.query.documentIndexJobs.findMany()).toEqual([]);
  });

  it("republication reuses identical revisions without duplicating retrieval results", async () => {
    const created = await createDocument("doc", { teamId, title: "Getting Started" });
    await db
      .update(documents)
      .set({ draftContent: headingDoc })
      .where(eq(documents.id, created.id));
    await publishDocument("doc", teamId, created.documentId, 1);
    const first = (await readDocumentation(teamId)).items[0];
    await publishDocument("doc", teamId, created.documentId, 1);
    expect((await readDocumentation(teamId)).items[0].revisionId).toBe(
      first.revisionId,
    );
    expect(await searchPublishedDocumentation(teamId, "Installation")).toHaveLength(1);
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

  it("turning off indexable is staged until publication, then drops chunks", async () => {
    const created = await createDocument("doc", {
      teamId,
      title: "Getting Started",
    });
    await db
      .update(documents)
      .set({ draftContent: headingDoc })
      .where(eq(documents.id, created.id));
    await publishDocument("doc", teamId, created.documentId, 1);
    await drainIndexJobs();

    await updateDocument("doc", teamId, created.documentId, {
      expectedDraftVersion: 1,
      meta: { indexable: false },
    });
    expect(await searchPublishedDocumentation(teamId, "Installation")).toHaveLength(1);
    await publishDocument("doc", teamId, created.documentId, 2);
    expect(await searchPublishedDocumentation(teamId, "Installation")).toHaveLength(0);
    expect((await readDocumentation(teamId)).items).toHaveLength(1);
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
