import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeTestDb, seedTeam, truncateAll, type TestDb } from "../test/db";
import { listenApp } from "../test/auth-app";

vi.mock("../db/client", async () => ({ db: await makeTestDb() }));
vi.mock("./notify", () => ({
  notifyTeamOfRequesterMessage: vi.fn().mockResolvedValue(undefined),
  notifyRequesterOfReply: vi.fn().mockResolvedValue(undefined),
  notifyRequesterOfTicketCreated: vi.fn().mockResolvedValue(undefined),
}));

import { eq } from "drizzle-orm";
import { db as testDb } from "../db/client";
import { tickets } from "../db/schema";
import { updateChatbotSettings } from "../chatbot/queries";
import { subscribeInbox } from "./live";
import { addTicketMessage, textTicketMessage } from "./queries";

const db = testDb as unknown as TestDb;

describe("agent alerts and requester read state", () => {
  let team: Awaited<ReturnType<typeof seedTeam>>["team"];

  beforeEach(async () => {
    await truncateAll(db);
    ({ team } = await seedTeam(db));
    await updateChatbotSettings(team.id, { enabled: true });
  });

  async function withApp(run: (origin: string) => Promise<void>) {
    const listening = await listenApp();
    try {
      await run(listening.origin);
    } finally {
      await listening.close();
    }
  }

  const post = (body: unknown) => ({
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  it("alerts agents when the AI leaves a chat message unanswered, not before", async () => {
    const events: Array<Record<string, unknown>> = [];
    const stop = subscribeInbox(team.id, {
      readyState: 1,
      send: (data) => events.push(JSON.parse(data)),
    });
    await withApp(async (origin) => {
      // No AI provider is configured, so nothing answers the visitor.
      const response = await fetch(
        `${origin}/public/${team.teamId}/chat`,
        post({ message: "Where is my invoice?" }),
      );
      expect(response.status).toBe(200);
      const { conversationId } = (await response.json()) as { conversationId: string };
      const alerts = events.filter((event) => event.requesterMessage);
      expect(alerts).toEqual([
        {
          type: "inbox.updated",
          ticketId: conversationId,
          requesterMessage: {
            from: "Website visitor",
            preview: "Where is my invoice?",
          },
        },
      ]);
    });
    stop();
  });

  it("alerts at once when a human already owns an email ticket", async () => {
    const events: Array<Record<string, unknown>> = [];
    const stop = subscribeInbox(team.id, {
      readyState: 1,
      send: (data) => events.push(JSON.parse(data)),
    });
    const [ticket] = await db
      .insert(tickets)
      .values({
        teamId: team.id,
        subject: "Refund",
        requesterEmail: "jane@example.com",
        requesterName: "Jane",
        source: "email",
        accessTokenHash: "x",
        aiState: "taken_over",
      })
      .returning();
    await addTicketMessage({
      teamId: team.id,
      ticketDbId: ticket.id,
      author: "requester",
      content: textTicketMessage("Any update?"),
    });
    expect(events.filter((event) => event.requesterMessage)).toEqual([
      {
        type: "inbox.updated",
        ticketId: ticket.ticketId,
        requesterMessage: { from: "Jane", preview: "Any update?" },
      },
    ]);
    stop();
  });

  it("records when the requester read the thread", async () => {
    await withApp(async (origin) => {
      const started = (await (
        await fetch(`${origin}/public/${team.teamId}/chat`, post({ message: "Hi" }))
      ).json()) as { conversationId: string; conversationToken: string };
      const thread = `${origin}/public/${team.teamId}/tickets/${started.conversationId}`;

      const before = (await (
        await fetch(`${thread}/messages?token=${started.conversationToken}`)
      ).json()) as { requesterLastReadAt: string | null };
      expect(before.requesterLastReadAt).toBeNull();

      const read = await fetch(
        `${thread}/read`,
        post({ token: started.conversationToken }),
      );
      expect(read.status).toBe(204);
      const after = (await (
        await fetch(`${thread}/messages?token=${started.conversationToken}`)
      ).json()) as { requesterLastReadAt: string | null };
      expect(after.requesterLastReadAt).toEqual(expect.any(String));

      const forged = await fetch(`${thread}/read`, post({ token: "nope" }));
      expect(forged.status).toBe(401);
    });
  });

  it("hands the chat to the team on Talk to a human", async () => {
    const events: Array<Record<string, unknown>> = [];
    const stop = subscribeInbox(team.id, {
      readyState: 1,
      send: (data) => events.push(JSON.parse(data)),
    });
    await withApp(async (origin) => {
      const started = (await (
        await fetch(
          `${origin}/public/${team.teamId}/chat`,
          post({ message: "Refund?" }),
        )
      ).json()) as { conversationId: string; conversationToken: string };
      const thread = `${origin}/public/${team.teamId}/tickets/${started.conversationId}`;
      const read = async () =>
        (await (
          await fetch(`${thread}/messages?token=${started.conversationToken}`)
        ).json()) as {
          humanHandling: boolean;
          messages: Array<{ author: string }>;
        };
      expect((await read()).humanHandling).toBe(false);
      events.length = 0;

      const escalated = await fetch(
        `${thread}/escalate`,
        post({ token: started.conversationToken }),
      );
      expect(escalated.status).toBe(204);

      const after = await read();
      expect(after.humanHandling).toBe(true);
      expect(after.messages.map((m) => m.author)).toEqual(["requester", "bot"]);
      const ticket = await db.query.tickets.findFirst({
        where: eq(tickets.ticketId, started.conversationId),
      });
      expect(ticket?.aiState).toBe("escalated");
      expect(ticket?.aiStopReason).toBe("visitor_request");
      expect(events.filter((event) => event.requesterMessage)).toEqual([
        {
          type: "inbox.updated",
          ticketId: started.conversationId,
          requesterMessage: { from: "Website visitor", preview: "Refund?" },
        },
      ]);

      // Again: nothing changes, nobody is alerted twice.
      events.length = 0;
      await fetch(`${thread}/escalate`, post({ token: started.conversationToken }));
      expect((await read()).messages).toHaveLength(2);
      expect(events.filter((event) => event.requesterMessage)).toEqual([]);

      const forged = await fetch(`${thread}/escalate`, post({ token: "nope" }));
      expect(forged.status).toBe(401);
    });
    stop();
  });
});
