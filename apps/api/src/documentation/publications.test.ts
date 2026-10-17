import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeTestDb, seedTeam, type TestDb } from "../test/db";
vi.mock("../media/service", () => ({
  deleteMedia: vi.fn(),
}));
vi.mock("../db/client", async () => ({ db: await makeTestDb() }));
import { db as appDb } from "../db/client";
import {
  documentationPublications as publications,
  documentationDeliveryOutbox as outbox,
  documentationRevisions as revisions,
  documents,
  docSections,
} from "../db/schema";
import { saveDocumentation, getDocsSettings } from "./authoring";
import {
  queuePublication,
  claimPublication,
  preparePublication,
  activatePublication,
  processPublication,
  readDocumentation,
  deliverDocumentationEvent,
  cleanupDocumentation,
  preflightPurge,
  commitPurge,
} from "./publications";
import { eq, inArray } from "drizzle-orm";
import { media } from "../db/schema";
import { deleteMediaRecord } from "../media/queries";
import { documentationEvidenceAllowed } from "./publications";
const db = appDb as unknown as TestDb;
describe("D3 immutable publication and policy (DM-PUBLISH/NAV/DELIVERY/RETENTION)", () => {
  let teamId: string;
  let ownerId: string;
  beforeEach(async () => {
    const seeded = await seedTeam(db);
    teamId = seeded.team.id;
    ownerId = seeded.account.id;
  });
  async function doc(
    title = "First",
    slug = "first",
    markdown = "## Setup\n\nPublished body",
  ) {
    return (await saveDocumentation(teamId, null, { title, slug, markdown }))!;
  }
  async function queue(
    selected: any[] = [],
    removals: string[] = [],
    key: string = crypto.randomUUID(),
  ) {
    const s = await getDocsSettings(teamId);
    return queuePublication(teamId, {
      selected,
      removals,
      expectedPublicationId: s.activePublicationId,
      expectedDocsDraftVersion: s.draftVersion,
      idempotencyKey: key,
    });
  }
  const select = (d: any) => ({
    documentId: d.documentId,
    expectedDraftVersion: d.draftVersion,
  });
  async function publish(d: any) {
    const job = await queue([select(d)]);
    return (await processPublication(teamId, job.publicationId))!;
  }
  it("replays an admitted publication idempotently even when the shared hourly quota is full", async () => {
    const d = await doc();
    const admitted = await queue([select(d)], [], "admitted-once");
    await db.insert(publications).values(
      Array.from({ length: 19 }, (_, i) => ({
        teamId,
        idempotencyKey: `quota-${i}`,
        inputHash: "hash",
        source: "editor" as const,
        generation: i + 100,
        purgeGeneration: 0,
        docsDraftVersion: 1,
        indexing: { enabled: false },
        navigation: [],
        status: "failed" as const,
      })),
    );
    expect(await queue([select(d)], [], "admitted-once")).toMatchObject({
      publicationId: admitted.publicationId,
    });
    await db
      .update(publications)
      .set({ status: "failed" })
      .where(eq(publications.publicationId, admitted.publicationId));
    await expect(queue([select(d)], [], "new-admission")).rejects.toMatchObject({
      retryAfter: expect.any(Number),
    });
    expect(
      (
        await db.query.documentationPublications.findMany({
          where: eq(publications.teamId, teamId),
        })
      ).filter((p) => p.admissionType === "explicit"),
    ).toHaveLength(20);
  });
  it("keeps old content live through admission and preparation, then switches once with an outbox event (V07,V08,V31)", async () => {
    const d = await doc();
    const first = await publish(d);
    const edit = (await saveDocumentation(teamId, d.documentId, {
      expectedDraftVersion: 1,
      markdown: "New body",
    }))!;
    const job = await queue([select(edit)]);
    expect((await readDocumentation(teamId)).items[0].content).toEqual(d.draftContent);
    const claimed = (await claimPublication(teamId, job.publicationId))!;
    await preparePublication(claimed);
    expect((await readDocumentation(teamId)).publicationId).toBe(first.publicationId);
    await activatePublication(teamId, job.publicationId, claimed.leaseToken!);
    const live = await readDocumentation(teamId);
    expect(live.items[0].content).toEqual(edit.draftContent);
    expect(live.publicationId).toBe(job.publicationId);
    expect(
      (
        await db.query.documentationDeliveryOutbox.findMany({
          where: eq(outbox.teamId, teamId),
        })
      ).length,
    ).toBe(2);
    const replay = await activatePublication(
      teamId,
      job.publicationId,
      "lost-after-commit",
    );
    expect(replay?.publicationId).toBe(job.publicationId);
    expect(
      (
        await db.query.documentationDeliveryOutbox.findMany({
          where: eq(outbox.teamId, teamId),
        })
      ).length,
    ).toBe(2);
  });
  it("captures immutable input so edits after enqueue survive activation as dirty drafts (V09)", async () => {
    const d = await doc();
    const job = await queue([select(d)]);
    const edit = await saveDocumentation(teamId, d.documentId, {
      expectedDraftVersion: 1,
      title: "Newer work",
    });
    await processPublication(teamId, job.publicationId);
    expect((await readDocumentation(teamId)).items[0].title).toBe("First");
    expect(
      (
        await db.query.documents.findFirst({
          where: eq(documents.documentId, d.documentId),
        })
      )?.draftTitle,
    ).toBe(edit?.draftTitle);
  });
  it("rejects stale Section review and keeps post-enqueue navigation changes staged (V34)", async () => {
    const d = await doc();
    const [section] = await db
      .insert(docSections)
      .values({ teamId, name: "Captured", slug: "captured" })
      .returning();
    const assigned = (await saveDocumentation(teamId, d.documentId, {
      expectedDraftVersion: 1,
      meta: { sectionId: section.sectionId },
    }))!;
    const s = await getDocsSettings(teamId);
    await expect(
      queuePublication(teamId, {
        selected: [select(assigned)],
        removals: [],
        expectedPublicationId: null,
        expectedDocsDraftVersion: s.draftVersion - 1,
        idempotencyKey: "stale",
      }),
    ).rejects.toThrow();
    const job = await queue([select(assigned)]);
    await db
      .update(docSections)
      .set({ name: "New draft name" })
      .where(eq(docSections.sectionId, section.sectionId));
    await processPublication(teamId, job.publicationId);
    expect((await readDocumentation(teamId)).sections[0].name).toBe("Captured");
  });
  it("rejects stale leases and supersedes an older request generation (V08,V15)", async () => {
    const d = await doc();
    const a = await queue([select(d)]);
    const claimed = (await claimPublication(teamId, a.publicationId))!;
    await preparePublication(claimed);
    await expect(
      activatePublication(teamId, a.publicationId, "wrong"),
    ).rejects.toThrow();
    const b = await queue([select(d)]);
    expect(
      (await activatePublication(teamId, a.publicationId, claimed.leaseToken!))?.status,
    ).toBe("superseded");
    expect((await readDocumentation(teamId)).items).toEqual([]);
    expect((await processPublication(teamId, b.publicationId))?.status).toBe("active");
  });
  it("reclaims an expired preparation without changing captured input (V08)", async () => {
    const d = await doc();
    const job = await queue([select(d)]);
    const first = (await claimPublication(teamId, job.publicationId))!;
    await db
      .update(publications)
      .set({ leaseExpiresAt: new Date(0) })
      .where(eq(publications.publicationId, job.publicationId));
    const second = (await claimPublication(teamId, job.publicationId))!;
    expect(second.leaseToken).not.toBe(first.leaseToken);
    expect(await preparePublication(first)).toBeUndefined();
    await preparePublication(second);
    await activatePublication(teamId, job.publicationId, second.leaseToken!);
    expect((await readDocumentation(teamId)).items[0].title).toBe("First");
  });
  it("keeps a last-good publication on invalid candidate links (V07)", async () => {
    const d = await doc();
    const first = await publish(d);
    const edit = (await saveDocumentation(teamId, d.documentId, {
      expectedDraftVersion: 1,
      markdown: "[Missing](/docs/missing)",
    }))!;
    const job = await queue([select(edit)]);
    expect((await processPublication(teamId, job.publicationId))?.status).toBe(
      "failed",
    );
    expect((await readDocumentation(teamId)).publicationId).toBe(first.publicationId);
  });
  it("replays identical admission and rejects key reuse without orphan snapshots", async () => {
    const d = await doc();
    const first = await queue([select(d)], [], "replay");
    expect((await queue([select(d)], [], "replay")).publicationId).toBe(
      first.publicationId,
    );
    await expect(queue([], [], "replay")).rejects.toThrow();
    expect(
      (
        await db.query.documentationPublications.findMany({
          where: eq(publications.teamId, teamId),
        })
      ).length,
    ).toBe(1);
  });
  it("permits atomic route swaps, and rolls back duplicate candidates (V03,V04)", async () => {
    const a = await doc("A", "a");
    const b = await doc("B", "b");
    const initial = await queue([select(a), select(b)]);
    await processPublication(teamId, initial.publicationId);
    const aa = (await saveDocumentation(teamId, a.documentId, {
      expectedDraftVersion: 1,
      slug: "b",
    }))!;
    await expect(queue([select(aa)])).rejects.toThrow();
    const bb = (await saveDocumentation(teamId, b.documentId, {
      expectedDraftVersion: 1,
      slug: "a",
    }))!;
    const swapped = await queue([select(aa), select(bb)]);
    await processPublication(teamId, swapped.publicationId);
    expect(
      (await readDocumentation(teamId)).items.find((x) => x.documentId === a.documentId)
        ?.slug,
    ).toBe("b");
  });
  it("normal removal validates remaining links before unpublishing (V10)", async () => {
    const a = await doc("A", "a", "[B](/docs/b)");
    const b = await doc("B", "b");
    const initial = await queue([select(a), select(b)]);
    await processPublication(teamId, initial.publicationId);
    const removal = await queue([], [b.documentId]);
    expect((await processPublication(teamId, removal.publicationId))?.status).toBe(
      "failed",
    );
    expect((await readDocumentation(teamId)).items).toHaveLength(2);
  });
  it("rejects expected live identity/epoch mismatches and isolates other teams (V25,V31)", async () => {
    const d = await doc();
    await publish(d);
    await expect(
      readDocumentation(teamId, { publicationId: "pub_old" }),
    ).rejects.toThrow();
    await expect(readDocumentation(teamId, { policyEpoch: 1 })).rejects.toThrow();
    const other = await seedTeam(db);
    expect((await readDocumentation(other.team.id)).items).toEqual([]);
  });
  it("persists destination acknowledgments across partial delivery failure (V31)", async () => {
    const d = await doc();
    expect(await publish(d)).toMatchObject({ status: "active" });
    const [e] = await db.query.documentationDeliveryOutbox.findMany({
      where: eq(outbox.teamId, teamId),
    });
    // Isolate this event from other tests' undelivered events.
    await db.update(outbox).set({ completedAt: new Date() });
    await db
      .update(outbox)
      .set({ completedAt: null, destinations: ["one", "two"] })
      .where(eq(outbox.eventId, e.eventId));
    const calls: string[] = [];
    await deliverDocumentationEvent(async (destination) => {
      calls.push(destination);
      if (destination === "two") throw Error("offline");
    });
    expect(
      (
        await db.query.documentationDeliveryOutbox.findFirst({
          where: eq(outbox.eventId, e.eventId),
        })
      )?.acknowledgments,
    ).toEqual(["one"]);
    await db
      .update(outbox)
      .set({ nextAttemptAt: new Date(0) })
      .where(eq(outbox.eventId, e.eventId));
    await deliverDocumentationEvent(async (destination) => {
      calls.push(destination);
    });
    expect(calls).toEqual(["one", "two", "two"]);
  });
  it("retains active references while collecting expired publications/revisions (V38)", async () => {
    const d = await doc();
    const first = await publish(d);
    const edit = (await saveDocumentation(teamId, d.documentId, {
      expectedDraftVersion: 1,
      title: "Replacement",
    }))!;
    await publish(edit);
    const future = new Date(Date.now() + 31 * 86400000);
    await cleanupDocumentation(future, 1000);
    expect(
      await db.query.documentationPublications.findFirst({
        where: eq(publications.publicationId, first.publicationId),
      }),
    ).toBeUndefined();
    expect((await readDocumentation(teamId)).items[0].title).toBe("Replacement");
    expect(
      (
        await db.query.documentationRevisions.findMany({
          where: eq(revisions.teamId, teamId),
        })
      ).length,
    ).toBe(1);
  });
  it("requires a fresh owner session and fences pending preparation during exact purge (V38)", async () => {
    const d = await doc();
    await publish(d);
    const pending = await queue([select(d)]);
    const lease = (await claimPublication(teamId, pending.publicationId))!;
    const plan = await preflightPurge(teamId, [d.documentId], ownerId);
    const input = {
      planId: plan.purgeId,
      planHash: plan.planHash,
      acknowledgment: "irreversible-deletion" as const,
      idempotencyKey: "purge",
    };
    await expect(
      commitPurge(teamId, input, {
        accountId: ownerId,
        isOwner: true,
        authKind: "oauth",
      }),
    ).rejects.toThrow();
    await expect(
      commitPurge(teamId, input, {
        accountId: ownerId,
        isOwner: true,
        authKind: "session",
        sessionAuthenticatedAt: new Date(0),
      }),
    ).rejects.toThrow();
    await commitPurge(teamId, input, {
      accountId: ownerId,
      isOwner: true,
      authKind: "session",
      sessionAuthenticatedAt: new Date(),
    });
    expect((await readDocumentation(teamId)).items).toEqual([]);
    expect(
      await db.query.documentationRevisions.findMany({
        where: eq(revisions.teamId, teamId),
      }),
    ).toEqual([]);
    expect(await preparePublication(lease)).toBeUndefined();
    expect(
      (
        await db.query.documentationPublications.findFirst({
          where: eq(publications.publicationId, pending.publicationId),
        })
      )?.status,
    ).toBe("superseded");
  });
  it("retained revisions protect media from deletion (V39)", async () => {
    const [asset] = await db
      .insert(media)
      .values({
        teamId,
        mediaLitId: "ml_" + teamId,
        url: "https://cdn.test.invalid/retained.png",
      })
      .returning();
    const d = (await saveDocumentation(teamId, null, {
      title: "Retained",
      featuredImage: { url: asset.url },
    }))!;
    await publish(d);
    const edit = (await saveDocumentation(teamId, d.documentId, {
      expectedDraftVersion: 1,
      featuredImage: null,
    }))!;
    await publish(edit);
    await expect(deleteMediaRecord(teamId, asset.mediaId)).rejects.toMatchObject({
      code: "MEDIA_IN_USE",
    });
  });
  it("accepts only evidence from the current active documentation publication", async () => {
    const d = await doc();
    await publish(d);
    const live = await readDocumentation(teamId);
    const evidence = [
      {
        documentId: d.documentId,
        kind: "doc",
        revisionId: live.items[0].revisionId,
        publicationId: live.publicationId,
        policyEpoch: live.policyEpoch,
      },
    ];
    expect(await documentationEvidenceAllowed(teamId, evidence)).toBe(true);
    expect(
      await documentationEvidenceAllowed(teamId, [
        { ...evidence[0], publicationId: "pub_wrong" },
      ]),
    ).toBe(false);
    expect(
      await documentationEvidenceAllowed(teamId, [
        { documentId: d.documentId, kind: "doc" },
      ]),
    ).toBe(false);
  });
  it("fences restoration and prevents a purged route from being recreated (V38)", async () => {
    const d = await doc();
    await publish(d);
    const plan = await preflightPurge(teamId, [d.documentId], ownerId);
    await commitPurge(
      teamId,
      {
        planId: plan.purgeId,
        planHash: plan.planHash,
        acknowledgment: "irreversible-deletion",
        idempotencyKey: "purge",
      },
      {
        accountId: ownerId,
        isOwner: true,
        authKind: "session",
        sessionAuthenticatedAt: new Date(),
      },
    );
    const copy = await doc("Recreated", "first");
    await expect(queue([select(copy)])).rejects.toThrow();
    expect((await readDocumentation(teamId)).items).toEqual([]);
    process.env.DOCS_RESTORE_PENDING = "true";
    try {
      await expect(readDocumentation(teamId)).rejects.toThrow();
      await expect(queue([])).rejects.toThrow();
    } finally {
      delete process.env.DOCS_RESTORE_PENDING;
    }
  });
  it("keeps other tenants claimable while one team has an active lease", async () => {
    await db
      .update(publications)
      .set({ status: "superseded", leaseToken: null, leaseExpiresAt: null })
      .where(inArray(publications.status, ["queued", "preparing", "prepared"]));
    const a = await doc();
    const aJob = await queue([select(a)]);
    await claimPublication(teamId, aJob.publicationId);
    await queue([select(a)]);
    const other = await seedTeam(db);
    const otherDoc = (await saveDocumentation(other.team.id, null, {
      title: "Other",
    }))!;
    const s = await getDocsSettings(other.team.id);
    const b = await queuePublication(other.team.id, {
      selected: [select(otherDoc)],
      removals: [],
      expectedPublicationId: null,
      expectedDocsDraftVersion: s.draftVersion,
      idempotencyKey: "other",
    });
    expect((await claimPublication())?.publicationId).toBe(b.publicationId);
  });
});
