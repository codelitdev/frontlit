import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeTestDb, seedTeam, type TestDb } from "../test/db";

vi.mock("../db/client", async () => ({
  db: await makeTestDb(),
  sqlTransactionsEnabled: false,
}));

import { eq } from "drizzle-orm";
import { db as testDb } from "../db/client";
import { ticketMailOutbox } from "../db/schema";
import { createTicket } from "../tickets/queries";
import { enqueueTicketMail, nextTicketMailSequence } from "./mail";

describe("ticket mail outbox", () => {
  const db = testDb as unknown as TestDb;
  let teamId: string;

  beforeEach(async () => {
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
});
