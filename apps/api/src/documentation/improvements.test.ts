import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeTestDb, seedTeam, type TestDb } from "../test/db";
vi.mock("../db/client", async () => ({ db: await makeTestDb() }));
import { db as appDb } from "../db/client";
import { eq } from "drizzle-orm";
import {
  documents,
  tickets,
  documentationEvidence,
  documentationImprovementReviews,
} from "../db/schema";
import { createTicket } from "../tickets/queries";
import {
  recordDocumentationEvidence,
  getDocumentationImprovement,
  listDocumentationImprovements,
  reviewDocumentationImprovement,
  createDocumentationImprovementDraft,
} from "./improvements";
import { publishDocument } from "../documents/queries";
const db = appDb as unknown as TestDb;
describe("D5 evidence/redaction lifecycle (DM-FEEDBACK,V41)", () => {
  let teamId: string, actor: any;
  beforeEach(async () => {
    const s = await seedTeam(db);
    teamId = s.team.id;
    actor = { isOwner: true, accountId: s.account.id };
  });
  async function event(question = "How do I reset API key 12?") {
    const c = await createTicket({
      teamId,
      subject: "Help",
      message: question,
      requesterEmail: null,
      source: "api",
      scheduleAi: false,
    });
    const input = {
      teamId,
      ticketDbId: c.ticket.id,
      messageDbId: c.firstMessage.id,
      trigger: "negative_feedback" as const,
    };
    return { c, input, ref: (await recordDocumentationEvidence(input))! };
  }
  async function approve(id: string) {
    const row = (await getDocumentationImprovement(teamId, id, actor))!;
    return (await reviewDocumentationImprovement(
      teamId,
      id,
      {
        action: "approve-summary",
        expectedVersion: row.version,
        title: "Reset API key",
        description: "Public reset guide",
        correction: "## Reset\n\nUse the account settings to rotate an API key.",
        noCustomerDetails: true,
      },
      actor,
    ))!;
  }
  it("deduplicates events, groups normalized questions but preserves product numbers and tenant isolation", async () => {
    const a = await event();
    expect(await recordDocumentationEvidence(a.input)).toEqual(a.ref);
    const b = await event("  HOW do I reset API key 12? ");
    expect(b.ref.itemId).toBe(a.ref.itemId);
    expect((await event("How do I reset API key 13?")).ref.itemId).not.toBe(
      a.ref.itemId,
    );
    expect(
      await getDocumentationImprovement(
        (await seedTeam(db)).team.id,
        a.ref.itemId,
        actor,
      ),
    ).toBeNull();
  });
  it("withholds raw/unapproved evidence and counts from docs-only readers and missing OAuth support scope", async () => {
    const a = await event("Customer secret 9876");
    const docs = { permissions: ["documentation:read", "documentation:write"] };
    expect(await listDocumentationImprovements(teamId, {}, docs)).toEqual({
      items: [],
      nextCursor: null,
    });
    expect(await getDocumentationImprovement(teamId, a.ref.itemId, docs)).toBeNull();
    await expect(
      reviewDocumentationImprovement(
        teamId,
        a.ref.itemId,
        { action: "dismiss", expectedVersion: 1 },
        docs,
      ),
    ).rejects.toMatchObject({ diagnostics: [{ code: "EVIDENCE_ACCESS_REQUIRED" }] });
    await approve(a.ref.itemId);
    const visible = (await getDocumentationImprovement(teamId, a.ref.itemId, docs))!;
    expect(JSON.stringify(visible)).not.toMatch(
      /9876|evidenceCount|ticketId|question|negative_feedback/,
    );
    expect(
      await getDocumentationImprovement(teamId, a.ref.itemId, {
        ...actor,
        authKind: "oauth",
        scopes: ["documentation:read"],
      }),
    ).not.toHaveProperty("evidence");
  });
  it("creates one safe draft per approved artifact, rejects conflicting retries, and links only its accepted revision", async () => {
    const a = await event();
    const approved = await approve(a.ref.itemId);
    const input = {
      expectedVersion: approved.version,
      approvedSummaryVersion: approved.approved!.version,
      idempotencyKey: "draft",
    };
    const draft = (await createDocumentationImprovementDraft(
      teamId,
      a.ref.itemId,
      input,
      actor,
    ))!;
    expect(
      await createDocumentationImprovementDraft(teamId, a.ref.itemId, input, actor),
    ).toEqual(draft);
    await expect(
      createDocumentationImprovementDraft(
        teamId,
        a.ref.itemId,
        { ...input, idempotencyKey: "other" },
        actor,
      ),
    ).rejects.toMatchObject({ diagnostics: [{ code: "IMPROVEMENT_DRAFT_EXISTS" }] });
    expect(
      await db.query.documents.findMany({ where: eq(documents.teamId, teamId) }),
    ).toHaveLength(1);
    expect(
      (await db.query.documents.findFirst({
        where: eq(documents.documentId, draft.documentId),
      }))!.draftMarkdown,
    ).not.toContain("key 12");
    await publishDocument("doc", teamId, draft.documentId, draft.draftVersion);
    expect(
      await getDocumentationImprovement(teamId, a.ref.itemId, actor),
    ).toMatchObject({
      state: "published",
      publicationId: expect.any(String),
      revisionId: expect.any(String),
    });
    expect((await event()).ref.itemId).not.toBe(a.ref.itemId);
  });
  it("keeps decisions closed, checks review versions and preserves evidence after merge", async () => {
    const a = await event();
    await reviewDocumentationImprovement(
      teamId,
      a.ref.itemId,
      { action: "dismiss", expectedVersion: 1 },
      actor,
    );
    const b = await event();
    expect(b.ref.itemId).not.toBe(a.ref.itemId);
    expect(
      await getDocumentationImprovement(teamId, b.ref.itemId, actor),
    ).toMatchObject({ predecessorId: a.ref.itemId });
    await expect(
      reviewDocumentationImprovement(
        teamId,
        b.ref.itemId,
        { action: "dismiss", expectedVersion: 99 },
        actor,
      ),
    ).rejects.toMatchObject({ diagnostics: [{ code: "STALE_IMPROVEMENT" }] });
    const c = await event("Different question");
    await reviewDocumentationImprovement(
      teamId,
      c.ref.itemId,
      {
        action: "merge",
        expectedVersion: 1,
        targetItemId: b.ref.itemId,
        expectedTargetVersion: 1,
      },
      actor,
    );
    expect(
      await getDocumentationImprovement(teamId, b.ref.itemId, actor),
    ).toMatchObject({ evidenceCount: 2 });
    expect(
      await reviewDocumentationImprovement(
        teamId,
        c.ref.itemId,
        {
          action: "merge",
          expectedVersion: 1,
          targetItemId: b.ref.itemId,
          expectedTargetVersion: 1,
        },
        actor,
      ),
    ).toMatchObject({ itemId: b.ref.itemId, evidenceCount: 2 });
    expect(
      await db.query.documentationImprovementReviews.findMany({
        where: eq(documentationImprovementReviews.itemId, c.ref.itemId),
      }),
    ).toHaveLength(1);
  });
  it("requires an explicit redaction declaration in the shared service", async () => {
    const a = await event();
    await expect(
      reviewDocumentationImprovement(
        teamId,
        a.ref.itemId,
        {
          action: "approve-summary",
          expectedVersion: 1,
          title: "Title",
          description: "Description",
          correction: "Correction",
          noCustomerDetails: false,
        },
        actor,
      ),
    ).rejects.toMatchObject({ diagnostics: [{ code: "INVALID_REQUEST" }] });
    expect(
      await getDocumentationImprovement(teamId, a.ref.itemId, actor),
    ).toMatchObject({ version: 1, approved: null });
  });
  it("removes raw pointers on source deletion while retaining only approved standalone artifacts", async () => {
    const a = await event();
    await approve(a.ref.itemId);
    await db.delete(tickets).where(eq(tickets.id, a.c.ticket.id));
    expect(
      await db.query.documentationEvidence.findMany({
        where: eq(documentationEvidence.teamId, teamId),
      }),
    ).toHaveLength(0);
    expect(
      await getDocumentationImprovement(teamId, a.ref.itemId, actor),
    ).toMatchObject({ evidence: [], evidenceCount: 0 });
    const b = await event("Unapproved standalone issue");
    await db.delete(tickets).where(eq(tickets.id, b.c.ticket.id));
    expect(await getDocumentationImprovement(teamId, b.ref.itemId, actor)).toBeNull();
  });
});
