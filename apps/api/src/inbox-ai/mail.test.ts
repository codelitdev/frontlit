import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeTestDb, seedTeam, type TestDb } from "../test/db";

vi.mock("../db/client", async () => ({
  db: await makeTestDb(),
  sqlTransactionsEnabled: false,
}));

vi.mock("../documentation/publications", () => ({
  documentationEvidenceAllowed: vi.fn().mockResolvedValue(true),
}));
vi.mock("../tickets/notify", () => ({
  notifyRequesterOfReply: vi.fn(),
  notifyRequesterOfTicketCreated: vi.fn(),
}));
import { documentationEvidenceAllowed } from "../documentation/publications";
import { notifyRequesterOfReply } from "../tickets/notify";
import { and, eq } from "drizzle-orm";
import { db as testDb } from "../db/client";
import { ticketMailOutbox } from "../db/schema";
import { createTicket } from "../tickets/queries";
import {
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
