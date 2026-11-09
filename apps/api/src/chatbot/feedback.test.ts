import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeTestDb, seedTeam, type TestDb } from "../test/db";

vi.mock("../db/client", async () => ({ db: await makeTestDb() }));

import { eq } from "drizzle-orm";
import { db as testDb } from "../db/client";
import { documentationEvidence, ticketMessages } from "../db/schema";
import { addTicketMessage, createTicket, textTicketMessage } from "../tickets/queries";
import { rateBotAnswer } from "./feedback";

const db = testDb as unknown as TestDb;
const anyDb = db as any;

describe("rateBotAnswer", () => {
  let teamId: string;
  beforeEach(async () => {
    teamId = (await seedTeam(db)).team.id;
  });

  async function conversation() {
    const { ticket } = await createTicket({
      teamId,
      subject: "How do I export?",
      message: "How do I export my data?",
      requesterEmail: null,
      source: "chatbot",
      scheduleAi: false,
    });
    const answer = await addTicketMessage({
      teamId,
      ticketDbId: ticket.id,
      author: "bot",
      content: textTicketMessage("Use Settings → Export [1]."),
      sources: [
        { documentId: "doc_export", slug: "export", title: "Export", anchor: null },
      ],
    });
    return { ticket, answer };
  }

  it("stores a thumbs up without filing an improvement", async () => {
    const { ticket, answer } = await conversation();
    expect(
      await rateBotAnswer({
        teamId,
        ticket,
        messageId: answer.messageId,
        rating: "up",
      }),
    ).toEqual({ messageId: answer.messageId, feedback: "up" });
    const [row] = await anyDb
      .select()
      .from(ticketMessages)
      .where(eq(ticketMessages.id, answer.id));
    expect(row.feedback).toBe("up");
    expect(await anyDb.select().from(documentationEvidence)).toEqual([]);
  });

  it("files a thumbs down once under the question it answered", async () => {
    const { ticket, answer } = await conversation();
    await rateBotAnswer({
      teamId,
      ticket,
      messageId: answer.messageId,
      rating: "down",
    });
    await rateBotAnswer({
      teamId,
      ticket,
      messageId: answer.messageId,
      rating: "down",
    });
    const evidence = await anyDb.select().from(documentationEvidence);
    expect(evidence).toHaveLength(1);
    expect(evidence[0].trigger).toBe("negative_feedback");
  });

  it("only rates bot answers", async () => {
    const { ticket } = await conversation();
    const [question] = await anyDb
      .select()
      .from(ticketMessages)
      .where(eq(ticketMessages.author, "requester"));
    expect(
      await rateBotAnswer({
        teamId,
        ticket,
        messageId: question.messageId,
        rating: "down",
      }),
    ).toBeNull();
  });
});
