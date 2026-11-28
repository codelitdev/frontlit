import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeTestDb, seedTeam, truncateAll, type TestDb } from "../test/db";

vi.mock("../db/client", async () => ({
  db: await makeTestDb(),
  sqlTransactionsEnabled: false,
}));

vi.mock("../documentation/publications", () => ({
  documentationEvidenceAllowed: vi.fn().mockResolvedValue(true),
}));
vi.mock("../tickets/notify", () => ({
  notifyRequesterOfReply: vi.fn(),
  notifyRequesterOfReplies: vi.fn(),
  notifyRequesterOfTicketCreated: vi.fn(),
}));
import { documentationEvidenceAllowed } from "../documentation/publications";
import { notifyRequesterOfReplies, notifyRequesterOfReply } from "../tickets/notify";
import { and, eq } from "drizzle-orm";
import { db as testDb } from "../db/client";
import { ticketMailOutbox, tickets } from "../db/schema";
import { addTicketMessage, createTicket, textTicketMessage } from "../tickets/queries";
import {
  REPLY_EMAIL_DELAY_MS,
  claimNextTicketMail,
  enqueueTicketMail,
  nextTicketMailSequence,
  processTicketMailJob,
} from "./mail";

describe("ticket mail outbox", () => {
  const db = testDb as unknown as TestDb;
  let teamId: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(documentationEvidenceAllowed).mockResolvedValue(true);
    const seeded = await seedTeam(db);
    teamId = seeded.team.id;
  });

  it("assigns a new sequence for each follow-up reply", async () => {
    const created = await createTicket({
      teamId,
      subject: "API",
      message: "How do I create a product?",
      requesterEmail: "casey@example.com",
      source: "form",
      scheduleAi: false,
    });
    expect(await nextTicketMailSequence(created.ticket.id)).toBe(2);

    await enqueueTicketMail({
      teamId,
      ticketDbId: created.ticket.id,
      kind: "reply",
      payload: { token: "a", replyText: "first" },
    });
    await enqueueTicketMail({
      teamId,
      ticketDbId: created.ticket.id,
      kind: "reply",
      payload: { token: "b", replyText: "second" },
    });

    const rows = await db.query.ticketMailOutbox.findMany({
      where: eq(ticketMailOutbox.ticketId, created.ticket.id),
    });
    const replies = rows
      .filter((row) => row.kind === "reply")
      .sort((a, b) => a.sequence - b.sequence);
    expect(replies.map((row) => row.sequence)).toEqual([2, 3]);
    expect(
      replies.map((row) => (row.payload as { replyText: string }).replyText),
    ).toEqual(["first", "second"]);
  });
  it("withholds and clears a queued reply when its documentation evidence changes", async () => {
    const created = await createTicket({
      teamId,
      subject: "Docs",
      message: "Help",
      requesterEmail: "casey@example.com",
      source: "form",
      scheduleAi: false,
    });
    await enqueueTicketMail({
      teamId,
      ticketDbId: created.ticket.id,
      kind: "reply",
      payload: {
        token: "a",
        replyText: "Stale answer",
        sources: [{ documentId: "doc_hidden", kind: "doc", revisionId: "rev_hidden" }],
      },
    });
    const job = await db.query.ticketMailOutbox.findFirst({
      where: and(
        eq(ticketMailOutbox.ticketId, created.ticket.id),
        eq(ticketMailOutbox.kind, "reply"),
      ),
    });
    vi.mocked(documentationEvidenceAllowed).mockResolvedValueOnce(false);
    await processTicketMailJob(job!);
    expect(notifyRequesterOfReply).not.toHaveBeenCalled();
    expect(documentationEvidenceAllowed).toHaveBeenCalledWith(teamId, [
      { documentId: "doc_hidden", kind: "doc", revisionId: "rev_hidden" },
    ]);
    const after = await db.query.ticketMailOutbox.findFirst({
      where: eq(ticketMailOutbox.id, job!.id),
    });
    expect(after?.status).toBe("sent");
    expect(after?.payload).toEqual({ withheld: "documentation_changed" });
    expect(after?.lastError).toBe("documentation_changed");
  });
});

describe("chat replies by email when unread (docs/embedded-support.md §6.7)", () => {
  const db = testDb as unknown as TestDb;
  let teamId: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    teamId = (await seedTeam(db)).team.id;
  });

  async function chat(requesterEmail: string | null = "sam@example.com") {
    const { ticket } = await createTicket({
      teamId,
      subject: "Upload failed",
      message: "My upload failed",
      requesterEmail,
      source: "chatbot",
      scheduleAi: false,
    });
    return ticket;
  }

  const reply = (ticketDbId: string, author: "agent" | "bot", text: string) =>
    addTicketMessage({ teamId, ticketDbId, author, content: textTicketMessage(text) });

  const digests = (ticketDbId: string) =>
    db.query.ticketMailOutbox
      .findMany({ where: eq(ticketMailOutbox.ticketId, ticketDbId) })
      .then((rows) => rows.filter((row) => row.payload.digest === true));

  it("queues one delayed email for a burst of replies", async () => {
    const ticket = await chat();
    const before = Date.now();
    await reply(ticket.id, "bot", "Try a smaller file.");
    await reply(ticket.id, "agent", "Looking into it.");

    const rows = await digests(ticket.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("pending");
    expect(rows[0].nextAttemptAt.getTime()).toBeGreaterThanOrEqual(
      before + REPLY_EMAIL_DELAY_MS - 1000,
    );
  });

  it("sends every unread reply in one email", async () => {
    const ticket = await chat();
    await reply(ticket.id, "bot", "Try a smaller file.");
    await reply(ticket.id, "agent", "Looking into it.");
    const [job] = await digests(ticket.id);

    await processTicketMailJob(job);

    expect(notifyRequesterOfReplies).toHaveBeenCalledTimes(1);
    const sent = vi.mocked(notifyRequesterOfReplies).mock.calls[0][0];
    expect(sent.requesterEmail).toBe("sam@example.com");
    expect(sent.token).toBeTruthy();
    expect(sent.replies.map((r) => [r.from, r.text])).toEqual([
      ["Assistant", "Try a smaller file."],
      ["Support", "Looking into it."],
    ]);
    const after = await db.query.ticketMailOutbox.findFirst({
      where: eq(ticketMailOutbox.id, job.id),
    });
    expect(after?.status).toBe("sent");
    expect(after?.payload).toMatchObject({ digest: true, replies: 2 });
  });

  it("sends nothing when the replies were read in the chat", async () => {
    const ticket = await chat();
    await reply(ticket.id, "agent", "Looking into it.");
    await db
      .update(tickets)
      .set({ requesterLastReadAt: new Date(Date.now() + 1000) })
      .where(eq(tickets.id, ticket.id));
    const [job] = await digests(ticket.id);

    await processTicketMailJob(job);

    expect(notifyRequesterOfReplies).not.toHaveBeenCalled();
    const after = await db.query.ticketMailOutbox.findFirst({
      where: eq(ticketMailOutbox.id, job.id),
    });
    expect(after?.status).toBe("sent");
    expect(after?.payload).toEqual({ digest: true, skipped: "read" });
  });

  it("doesn't repeat replies an earlier email already covered", async () => {
    const ticket = await chat();
    await reply(ticket.id, "agent", "First answer.");
    const [first] = await digests(ticket.id);
    await processTicketMailJob(first);

    await reply(ticket.id, "agent", "Second answer.");
    const second = (await digests(ticket.id)).find((row) => row.status === "pending")!;
    await processTicketMailJob(second);

    const calls = vi.mocked(notifyRequesterOfReplies).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[1][0].replies.map((r) => r.text)).toEqual(["Second answer."]);
  });

  it("emails nobody for anonymous chats, and leaves email tickets to the reply route", async () => {
    const anonymous = await chat(null);
    await reply(anonymous.id, "agent", "Hi");
    expect(await digests(anonymous.id)).toHaveLength(0);

    const { ticket: form } = await createTicket({
      teamId,
      subject: "Invoice",
      message: "Where is it?",
      requesterEmail: "casey@example.com",
      source: "form",
      scheduleAi: false,
    });
    await reply(form.id, "agent", "Attached.");
    expect(await digests(form.id)).toHaveLength(0);
  });

  it("doesn't let one ticket's waiting mail hold up another ticket's", async () => {
    await truncateAll(db);
    teamId = (await seedTeam(db)).team.id;
    const blocked = await chat();
    const other = await chat("priya@example.com");
    const past = new Date(Date.now() - 60_000);
    // Sequence 1 retries later; sequence 2 of the same ticket is due but must wait.
    await db.delete(ticketMailOutbox);
    await enqueueTicketMail({
      teamId,
      ticketDbId: blocked.id,
      sequence: 1,
      kind: "reply",
      payload: { token: "t", replyText: "a" },
      nextAttemptAt: new Date(Date.now() + 60_000),
    });
    await enqueueTicketMail({
      teamId,
      ticketDbId: blocked.id,
      sequence: 2,
      kind: "reply",
      payload: { token: "t", replyText: "b" },
      nextAttemptAt: past,
    });
    await enqueueTicketMail({
      teamId,
      ticketDbId: other.id,
      sequence: 1,
      kind: "reply",
      payload: { token: "t", replyText: "c" },
      nextAttemptAt: new Date(Date.now() - 1000),
    });

    const claimed = await claimNextTicketMail();
    expect(claimed?.ticketId).toBe(other.id);
  });
});
