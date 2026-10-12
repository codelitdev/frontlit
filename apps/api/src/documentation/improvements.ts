import {
  reviewDocumentationImprovementSchema,
  createDocumentationImprovementDraftSchema,
} from "@frontlit/api-contract";
import { createHash } from "node:crypto";
import { and, desc, eq, gt, isNotNull, isNull, inArray, sql } from "drizzle-orm";
import { db } from "../db/client";
import {
  documentationImprovements as items,
  documentationEvidence as evidence,
  documentationImprovementDrafts as drafts,
  documentationImprovementReviews as reviews,
  tickets,
  ticketMessages,
  documents,
} from "../db/schema";
import { DocsContentError, diagnostic } from "@frontlit/text-editor/docs";
import { lockSettings, saveDocumentation } from "./authoring";
import { ticketMessageText } from "../tickets/queries";
import { serializeDates } from "../utils/public";

export type ImprovementActor = {
  isOwner?: boolean;
  accountId?: string;
  permissions?: string[];
  scopes?: string[];
  authKind?: string;
};
export function canReadSupportEvidence(actor: ImprovementActor) {
  return Boolean(
    (actor.isOwner ||
      (actor.permissions?.includes("documentation:read") &&
        actor.permissions?.includes("helpdesk:read"))) &&
      (actor.authKind !== "oauth" ||
        (actor.scopes?.includes("documentation:read") &&
          actor.scopes?.includes("helpdesk:read"))),
  );
}
function error(code: string, message: string): never {
  throw new DocsContentError([diagnostic(code, message)]);
}
function hash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
export function normalizeQuestion(question: string) {
  return question.normalize("NFKC").replace(/\s+/gu, " ").trim().toLowerCase();
}

/** Internal support-event ingress. Source IDs are validated together; never accepts customer text. */
export async function recordDocumentationEvidence(input: {
  teamId: string;
  ticketDbId: string;
  messageDbId: string;
  trigger: "retrieval_miss" | "negative_feedback" | "escalation";
  eventId?: string;
  targetDocumentId?: string | null;
  retrieved?: {
    documentId: string;
    revisionId?: string;
    publicationId?: string | null;
    anchor?: string | null;
  }[];
}) {
  return db.transaction(async (tx) => {
    await lockSettings(tx as any, input.teamId);
    const ticket = await tx.query.tickets.findFirst({
      where: and(eq(tickets.teamId, input.teamId), eq(tickets.id, input.ticketDbId)),
    });
    const message = await tx.query.ticketMessages.findFirst({
      where: and(
        eq(ticketMessages.teamId, input.teamId),
        eq(ticketMessages.ticketId, input.ticketDbId),
        eq(ticketMessages.id, input.messageDbId),
      ),
    });
    if (!ticket || !message || message.author !== "requester") return null;
    if (
      input.targetDocumentId &&
      !(await tx.query.documents.findFirst({
        where: and(
          eq(documents.teamId, input.teamId),
          eq(documents.documentId, input.targetDocumentId),
          eq(documents.kind, "doc"),
        ),
      }))
    )
      return null;
    const dedupeKey = hash([
      input.ticketDbId,
      input.eventId ?? input.messageDbId,
      input.trigger,
    ]);
    const replay = await tx.query.documentationEvidence.findFirst({
      where: and(eq(evidence.teamId, input.teamId), eq(evidence.dedupeKey, dedupeKey)),
    });
    if (replay) return { itemId: replay.itemId, evidenceId: replay.evidenceId };
    const groupKey = hash([
      input.trigger,
      input.targetDocumentId ?? null,
      normalizeQuestion(ticketMessageText(message.content)),
    ]);
    const previous = await tx.query.documentationImprovements.findFirst({
      where: and(
        eq(items.teamId, input.teamId),
        eq(items.groupKey, groupKey),
        isNull(items.mergedIntoId),
      ),
      orderBy: desc(items.createdAt),
    });
    let item =
      previous &&
      ["open", "draft_created"].includes(previous.state) &&
      previous.createdAt.getTime() > Date.now() - 30 * 86400000
        ? previous
        : null;
    if (!item)
      [item] = await tx
        .insert(items)
        .values({
          teamId: input.teamId,
          groupKey,
          reason: input.trigger,
          targetDocumentId: input.targetDocumentId,
          predecessorId: previous?.itemId,
        })
        .returning();
    else
      await tx
        .update(items)
        .set({ version: item.version + 1, updatedAt: new Date() })
        .where(eq(items.itemId, item.itemId));
    const [created] = await tx
      .insert(evidence)
      .values({
        teamId: input.teamId,
        itemId: item!.itemId,
        ticketId: ticket.id,
        messageId: message.id,
        dedupeKey,
        trigger: input.trigger,
        retrieved: input.retrieved?.slice(0, 8) ?? [],
        expiresAt: new Date(Date.now() + 30 * 86400000),
      })
      .returning();
    return { itemId: item!.itemId, evidenceId: created.evidenceId };
  });
}

async function project(
  teamId: string,
  row: typeof items.$inferSelect,
  actor: ImprovementActor,
  executor: any = db,
) {
  // A docs-only contributor receives only the reviewed standalone artifact.
  const base = {
    itemId: row.itemId,
    version: row.version,
    state: row.state,
    approved: row.approved,
    draftDocumentId: row.draftDocumentId,
    draftVersion: row.draftVersion,
    revisionId: row.revisionId,
    publicationId: row.publicationId,
  };
  if (!canReadSupportEvidence(actor)) return row.approved ? serializeDates(base) : null;
  const sources = await executor
    .select({ ref: evidence, ticket: tickets, message: ticketMessages })
    .from(evidence)
    .innerJoin(
      tickets,
      and(eq(evidence.ticketId, tickets.id), eq(tickets.teamId, teamId)),
    )
    .innerJoin(
      ticketMessages,
      and(
        eq(evidence.messageId, ticketMessages.id),
        eq(ticketMessages.teamId, teamId),
        eq(ticketMessages.ticketId, tickets.id),
      ),
    )
    .where(
      and(
        eq(evidence.teamId, teamId),
        eq(evidence.itemId, row.itemId),
        gt(evidence.expiresAt, new Date()),
      ),
    );
  if (!sources.length && !row.approved) return null;
  return serializeDates({
    ...base,
    reason: row.reason,
    targetDocumentId: row.targetDocumentId,
    predecessorId: row.predecessorId,
    mergedIntoId: row.mergedIntoId,
    evidenceCount: sources.length,
    evidence: sources.map(({ ref, ticket, message }: any) => ({
      evidenceId: ref.evidenceId,
      trigger: ref.trigger,
      ticketId: ticket.ticketId,
      messageId: message.messageId,
      question: ticketMessageText(message.content).slice(0, 4000),
      retrieved: ref.retrieved,
      createdAt: ref.createdAt,
    })),
  });
}
export async function getDocumentationImprovement(
  teamId: string,
  itemId: string,
  actor: ImprovementActor,
  executor: any = db,
) {
  const row = await executor.query.documentationImprovements.findFirst({
    where: and(eq(items.teamId, teamId), eq(items.itemId, itemId)),
  });
  return row ? project(teamId, row, actor, executor) : null;
}
export async function listDocumentationImprovements(
  teamId: string,
  input: { cursor?: string; limit?: number; state?: string },
  actor: ImprovementActor,
) {
  if (input.cursor && !(await getDocumentationImprovement(teamId, input.cursor, actor)))
    return null;
  const limit = Math.min(input.limit ?? 20, 100);
  const visible = canReadSupportEvidence(actor)
    ? sql`(${items.approved} is not null OR EXISTS (SELECT 1 FROM documentation_evidence e JOIN tickets t ON t.id=e.ticket_id JOIN ticket_messages m ON m.id=e.message_id WHERE e.item_id=${items.itemId} AND e.team_id=${teamId} AND t.team_id=${teamId} AND m.team_id=${teamId} AND e.expires_at > now()))`
    : isNotNull(items.approved);
  const rows = await db.query.documentationImprovements.findMany({
    where: and(
      eq(items.teamId, teamId),
      visible,
      isNull(items.mergedIntoId),
      input.state ? eq(items.state, input.state as any) : undefined,
      input.cursor
        ? sql`(${items.createdAt},${items.itemId}) < (select created_at,item_id from documentation_improvements where team_id=${teamId} and item_id=${input.cursor})`
        : undefined,
    ),
    orderBy: [desc(items.createdAt), desc(items.itemId)],
    limit: limit + 1,
  });
  const projected = (
    await Promise.all(rows.slice(0, limit).map((row) => project(teamId, row, actor)))
  ).filter(Boolean);
  return {
    items: projected,
    nextCursor: rows.length > limit ? rows[limit - 1].itemId : null,
  };
}

export async function reviewDocumentationImprovement(
  teamId: string,
  itemId: string,
  input: any,
  actor: ImprovementActor,
) {
  if (!canReadSupportEvidence(actor) || !actor.accountId)
    error(
      "EVIDENCE_ACCESS_REQUIRED",
      "Support evidence access is required to review this item.",
    );
  const parsed = reviewDocumentationImprovementSchema.safeParse(input);
  if (!parsed.success)
    error(
      "INVALID_REQUEST",
      parsed.error.issues.map((issue) => issue.message).join("; "),
    );
  input = parsed.data;
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select item_id from documentation_improvements where team_id=${teamId} and item_id=${itemId} for update`,
    );
    const row = await tx.query.documentationImprovements.findFirst({
      where: and(eq(items.teamId, teamId), eq(items.itemId, itemId)),
    });
    if (!row) return null;
    if (row.mergedIntoId) {
      if (
        input.action === "merge" &&
        row.mergedIntoId === input.targetItemId &&
        row.version === input.expectedVersion + 1
      )
        return getDocumentationImprovement(teamId, row.mergedIntoId, actor, tx);
      error("IMPROVEMENT_MERGED", "Review the destination improvement.");
    }
    if (!(await getDocumentationImprovement(teamId, itemId, actor, tx))) return null;
    if (row.version !== input.expectedVersion)
      error("STALE_IMPROVEMENT", "Refresh the improvement before reviewing it.");
    if (row.mergedIntoId)
      error("IMPROVEMENT_MERGED", "Review the destination improvement.");
    if (input.action === "merge") {
      if (input.targetItemId === itemId)
        error("INVALID_REFERENCE", "Choose another open improvement.");
      const target = await tx.query.documentationImprovements.findFirst({
        where: and(
          eq(items.teamId, teamId),
          eq(items.itemId, input.targetItemId),
          eq(items.state, "open"),
          isNull(items.mergedIntoId),
        ),
      });
      if (
        !target ||
        !(await getDocumentationImprovement(teamId, target.itemId, actor, tx))
      )
        return null;
      if (target.version !== input.expectedTargetVersion)
        error("STALE_IMPROVEMENT", "Refresh the destination improvement.");
      const changed = await tx
        .update(items)
        .set({ version: target.version + 1, updatedAt: new Date() })
        .where(and(eq(items.itemId, target.itemId), eq(items.version, target.version)))
        .returning();
      if (!changed.length)
        error("STALE_IMPROVEMENT", "Refresh the destination improvement.");
      await tx
        .update(evidence)
        .set({ itemId: target.itemId })
        .where(and(eq(evidence.teamId, teamId), eq(evidence.itemId, itemId)));
      await tx
        .update(items)
        .set({
          mergedIntoId: target.itemId,
          version: row.version + 1,
          updatedAt: new Date(),
        })
        .where(eq(items.itemId, itemId));
      await tx.insert(reviews).values({
        teamId,
        itemId,
        actorAccountId: actor.accountId!,
        itemVersion: row.version + 1,
        action: input.action,
        input,
      });
      return {
        ...(await project(
          teamId,
          { ...row, mergedIntoId: target.itemId, version: row.version + 1 },
          actor,
          tx,
        )),
      };
    }
    if (input.action === "approve-summary" && row.draftDocumentId)
      error(
        "DRAFT_ALREADY_CREATED",
        "Edit the linked draft explicitly; approval does not rewrite it.",
      );
    const patch =
      input.action === "approve-summary"
        ? {
            approved: {
              version: (row.approved?.version ?? 0) + 1,
              title: input.title,
              description: input.description,
              correction: input.correction,
              actorAccountId: actor.accountId!,
              approvedAt: new Date().toISOString(),
              noCustomerDetails: true as const,
            },
          }
        : {
            state:
              input.action === "dismiss" ? ("dismissed" as const) : ("open" as const),
          };
    const [updated] = await tx
      .update(items)
      .set({ ...patch, version: row.version + 1, updatedAt: new Date() })
      .where(eq(items.itemId, itemId))
      .returning();
    await tx.insert(reviews).values({
      teamId,
      itemId,
      actorAccountId: actor.accountId!,
      itemVersion: row.version + 1,
      action: input.action,
      input,
    });
    return serializeDates({
      itemId: updated.itemId,
      version: updated.version,
      state: updated.state,
      approved: updated.approved,
      draftDocumentId: updated.draftDocumentId,
      draftVersion: updated.draftVersion,
    });
  });
}

export async function createDocumentationImprovementDraft(
  teamId: string,
  itemId: string,
  input: any,
  actor: ImprovementActor,
) {
  const parsed = createDocumentationImprovementDraftSchema.safeParse(input);
  if (!parsed.success)
    error(
      "INVALID_REQUEST",
      parsed.error.issues.map((issue) => issue.message).join("; "),
    );
  input = parsed.data;
  return db.transaction(async (tx) => {
    await lockSettings(tx as any, teamId);
    await tx.execute(
      sql`select item_id from documentation_improvements where team_id=${teamId} and item_id=${itemId} for update`,
    );
    const row = await tx.query.documentationImprovements.findFirst({
      where: and(eq(items.teamId, teamId), eq(items.itemId, itemId)),
    });
    if (!row?.approved || row.mergedIntoId) return null;
    const inputHash = hash(input);
    const replay = await tx.query.documentationImprovementDrafts.findFirst({
      where: and(
        eq(drafts.itemId, itemId),
        eq(drafts.approvedVersion, input.approvedSummaryVersion),
      ),
    });
    if (replay) {
      if (
        replay.idempotencyKey !== input.idempotencyKey ||
        replay.inputHash !== inputHash
      )
        error(
          "IMPROVEMENT_DRAFT_EXISTS",
          "This approved artifact already has a linked draft.",
        );
      return {
        itemId,
        documentId: replay.documentId,
        draftVersion: replay.draftVersion,
      };
    }
    if (
      row.version !== input.expectedVersion ||
      row.approved.version !== input.approvedSummaryVersion
    )
      error(
        "STALE_IMPROVEMENT",
        "Refresh the approved artifact before creating a draft.",
      );
    if (!["open", "draft_created"].includes(row.state))
      error("INVALID_IMPROVEMENT_STATE", "Reopen the item before creating a draft.");
    const artifact = row.approved;
    const saved = await saveDocumentation(
      teamId,
      input.targetDocumentId ?? null,
      {
        title: artifact.title,
        // Approved correction is the sole body source. No ticket excerpt or unapproved model summary is copied.
        markdown: `${artifact.description}\n\n${artifact.correction}`,
        ...(input.targetDocumentId
          ? { expectedDraftVersion: input.expectedDraftVersion }
          : {}),
      },
      actor.accountId,
      tx as any,
    );
    if (!saved) return null;
    await tx.insert(drafts).values({
      itemId,
      approvedVersion: artifact.version,
      itemVersion: row.version,
      idempotencyKey: input.idempotencyKey,
      inputHash,
      documentId: saved.documentId,
      draftVersion: saved.draftVersion,
    });
    await tx
      .update(items)
      .set({
        state: "draft_created",
        version: row.version + 1,
        draftDocumentId: saved.documentId,
        draftVersion: saved.draftVersion,
        draftHash: saved.draftHash,
        updatedAt: new Date(),
      })
      .where(eq(items.itemId, itemId));
    return { itemId, documentId: saved.documentId, draftVersion: saved.draftVersion };
  });
}

export async function cleanupDocumentationEvidence(limit = 100) {
  // Raw copies are not stored; FK deletion removes source pointers immediately.
  const expired = await db
    .select({ id: evidence.evidenceId })
    .from(evidence)
    .where(sql`${evidence.expiresAt} <= now()`)
    .limit(limit);
  if (expired.length)
    await db.delete(evidence).where(
      inArray(
        evidence.evidenceId,
        expired.map((row) => row.id),
      ),
    );
}
