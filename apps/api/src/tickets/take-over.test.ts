import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeTestDb, seedTeam, truncateAll, type TestDb } from "../test/db";
import { listenApp } from "../test/auth-app";

vi.mock("../db/client", async () => ({ db: await makeTestDb() }));

import { db as testDb } from "../db/client";
import { createApiKey } from "../apikey/queries";
import { createTicket, getTicketByTicketId } from "./queries";

const db = testDb as unknown as TestDb;

describe("POST /tickets/:ticketId/take-over", () => {
  beforeEach(async () => {
    await truncateAll(db);
  });

  it("takes a chat from the AI and returns the thread with the join line", async () => {
    const { team } = await seedTeam(db);
    const key = (await createApiKey(team.id, "Full", testDb)).secret;
    const { ticket } = await createTicket({
      teamId: team.id,
      subject: "Hi",
      message: "Hi",
      requesterEmail: null,
      source: "chatbot",
    });

    const listening = await listenApp();
    try {
      const response = await fetch(
        `${listening.origin}/tickets/${ticket.ticketId}/take-over`,
        { method: "POST", headers: { "x-frontlit-apikey": key } },
      );
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        aiState: string;
        messages: Array<{ author: string }>;
      };
      expect(body.aiState).toBe("taken_over");
      expect(body.messages.map((message) => message.author)).toEqual([
        "requester",
        "system",
      ]);
    } finally {
      await listening.close();
    }
    expect((await getTicketByTicketId(team.id, ticket.ticketId))?.aiState).toBe(
      "taken_over",
    );
  });
});
