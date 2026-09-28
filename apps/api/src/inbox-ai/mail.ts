import { and, asc, desc, eq, lte } from "drizzle-orm";
import { db } from "../db/client";
import { ticketMailOutbox, tickets } from "../db/schema";
import {
  notifyRequesterOfReply,
  notifyRequesterOfTicketCreated,
} from "../tickets/notify";
import { logger } from "../services/log";
import { incrementCounter } from "../services/metrics";

export async function nextTicketMailSequence(ticketDbId: string) {
  const latest = await db.query.ticketMailOutbox.findFirst({
    where: eq(ticketMailOutbox.ticketId, ticketDbId),
    orderBy: desc(ticketMailOutbox.sequence),
    columns: { sequence: true },
  });
  return (latest?.sequence ?? 0) + 1;
}

export async function enqueueTicketMail(input: {
  teamId: string;
  ticketDbId: string;
  sequence?: number;
  kind: "receipt" | "reply";
  payload: Record<string, unknown>;
}) {
  const sequence = input.sequence ?? (await nextTicketMailSequence(input.ticketDbId));
  try {
    await db.insert(ticketMailOutbox).values({
      teamId: input.teamId,
      ticketId: input.ticketDbId,
      sequence,
      kind: input.kind,
      payload: input.payload,
    });
  } catch {
    // Unique (ticket, sequence) — retries are idempotent.
  }
}

export async function claimNextTicketMail() {
  const [job] = await db.query.ticketMailOutbox.findMany({
    where: and(
      eq(ticketMailOutbox.status, "pending"),
      lte(ticketMailOutbox.nextAttemptAt, new Date()),
    ),
    orderBy: asc(ticketMailOutbox.nextAttemptAt),
    limit: 1,
  });
  if (!job) return null;

  if (job.sequence > 1) {
    const prior = await db.query.ticketMailOutbox.findFirst({
      where: and(
        eq(ticketMailOutbox.ticketId, job.ticketId),
        eq(ticketMailOutbox.sequence, job.sequence - 1),
      ),
    });
    if (prior && prior.status !== "sent") return null;
  }

  const [claimed] = await db
    .update(ticketMailOutbox)
    .set({ status: "sending", updatedAt: new Date() })
    .where(and(eq(ticketMailOutbox.id, job.id), eq(ticketMailOutbox.status, "pending")))
    .returning();
  return claimed ?? null;
}

export async function processTicketMailJob(job: typeof ticketMailOutbox.$inferSelect) {
  const ticket = await db.query.tickets.findFirst({
    where: eq(tickets.id, job.ticketId),
  });
  if (!ticket?.requesterEmail) {
    await db
      .update(ticketMailOutbox)
      .set({ status: "sent", updatedAt: new Date() })
      .where(eq(ticketMailOutbox.id, job.id));
    return;
  }

  const token = String(job.payload.token ?? "");
  if (!token) throw new Error("ticket_mail_missing_token");

  if (job.kind === "receipt") {
    await notifyRequesterOfTicketCreated({
      teamId: ticket.teamId,
      ticketId: ticket.ticketId,
      token,
      requesterEmail: ticket.requesterEmail,
      subject: ticket.subject,
    });
  } else {
    await notifyRequesterOfReply({
      teamId: ticket.teamId,
      ticketId: ticket.ticketId,
      token,
      requesterEmail: ticket.requesterEmail,
      subject: ticket.subject,
      replyText: String(job.payload.replyText ?? ""),
      sources: Array.isArray(job.payload.sources)
        ? (job.payload.sources as {
            slug: string;
            title: string | null;
            anchor?: string | null;
          }[])
        : [],
    });
  }

  await db
    .update(ticketMailOutbox)
    .set({ status: "sent", updatedAt: new Date() })
    .where(eq(ticketMailOutbox.id, job.id));
}

export async function failTicketMailJob(
  job: typeof ticketMailOutbox.$inferSelect,
  error: string,
) {
  const attempts = job.attempts + 1;
  const retry = attempts < 8;
  await db
    .update(ticketMailOutbox)
    .set({
      status: retry ? "pending" : "failed",
      attempts,
      lastError: error.slice(0, 500),
      nextAttemptAt: new Date(Date.now() + Math.min(1000 * 2 ** attempts, 3_600_000)),
      updatedAt: new Date(),
    })
    .where(eq(ticketMailOutbox.id, job.id));
  incrementCounter("inbox_ai_mail_failures_total", {
    kind: job.kind,
    exhausted: retry ? "false" : "true",
  });
  logger.warn({ jobId: job.id, error }, "Ticket mail job failed");
}
