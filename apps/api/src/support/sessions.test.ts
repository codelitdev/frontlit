import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeTestDb, seedTeam, truncateAll, type TestDb } from "../test/db";
import { listenApp } from "../test/auth-app";

vi.mock("../db/client", async () => ({ db: await makeTestDb() }));
vi.mock("../tickets/notify", () => ({
  notifyTeamOfRequesterMessage: vi.fn().mockResolvedValue(undefined),
  notifyRequesterOfReply: vi.fn().mockResolvedValue(undefined),
  notifyRequesterOfTicketCreated: vi.fn().mockResolvedValue(undefined),
}));

import { db as testDb } from "../db/client";
import { outboxJobs, supportSessions, tickets } from "../db/schema";
import { createApiKey } from "../apikey/queries";
import { updateChatbotSettings } from "../chatbot/queries";
import { listTickets } from "../tickets/queries";

const db = testDb as unknown as TestDb;

const sessionBody = {
  contact: { email: "Jane@Example.com", name: "Jane", externalId: "user_8f2" },
  account: { id: "school_1", name: "Acme Academy", url: "https://acme.example.com" },
  context: { page: "/dashboard/media", error: "Upload failed", requestId: "req_42" },
  message: "My image upload failed",
};

describe("in-app support sessions (docs/embedded-support.md §6.2)", () => {
  let team: Awaited<ReturnType<typeof seedTeam>>["team"];
  let sessionsKey: string;
  let fullKey: string;

  beforeEach(async () => {
    await truncateAll(db);
    ({ team } = await seedTeam(db));
    await updateChatbotSettings(team.id, { enabled: true });
    sessionsKey = (await createApiKey(team.id, "CourseLit", db, "support:sessions"))
      .secret;
    fullKey = (await createApiKey(team.id, "Full", db)).secret;
  });

  async function withApp(run: (origin: string) => Promise<void>) {
    const listening = await listenApp();
    try {
      await run(listening.origin);
    } finally {
      await listening.close();
    }
  }

  const json = (body: unknown, apiKey?: string) => ({
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(apiKey ? { "x-frontlit-apikey": apiKey } : {}),
    },
    body: JSON.stringify(body),
  });

  it("mints a session, opens a blank chat, and creates the ticket on the first message", async () => {
    await withApp(async (origin) => {
      const minted = await fetch(
        `${origin}/support-sessions`,
        json(sessionBody, sessionsKey),
      );
      expect(minted.status).toBe(201);
      const session = (await minted.json()) as { token: string; url: string };
      expect(session.url).toContain(`/${team.teamId}/chat#token=${session.token}`);
      // Minting creates no ticket.
      expect(await db.query.tickets.findMany()).toHaveLength(0);

      const opened = await fetch(
        `${origin}/public/${team.teamId}/support-sessions/open`,
        json({ token: session.token }),
      );
      expect(opened.status).toBe(200);
      expect(await opened.json()).toEqual({
        ticket: null,
        prefill: "My image upload failed",
        requester: { name: "Jane" },
      });

      const chat = await fetch(
        `${origin}/public/${team.teamId}/chat`,
        json({ message: "My image upload failed", sessionToken: session.token }),
      );
      expect(chat.status).toBe(200);
      const answer = (await chat.json()) as {
        conversationId: string;
        conversationToken: string;
      };

      const ticket = await db.query.tickets.findFirst({
        where: eq(tickets.ticketId, answer.conversationId),
      });
      expect(ticket).toMatchObject({
        source: "chatbot",
        requesterEmail: "jane@example.com",
        requesterName: "Jane",
        requesterExternalId: "user_8f2",
        requesterAccount: sessionBody.account,
        context: sessionBody.context,
      });
      // In-app chats don't email a receipt.
      expect(await db.query.ticketMailOutbox.findMany()).toHaveLength(0);
      const [job] = await db.query.outboxJobs.findMany({
        where: eq(outboxJobs.type, "contact_sync"),
      });
      expect(job.payload).toEqual({
        email: "jane@example.com",
        name: "Jane",
        sourcePath: "/chat",
        ticketId: ticket!.id,
        externalId: "user_8f2",
        account: sessionBody.account,
      });

      // The returned grant works on the public thread endpoint.
      const thread = await fetch(
        `${origin}/public/${team.teamId}/tickets/${answer.conversationId}/messages?token=${answer.conversationToken}`,
      );
      expect(thread.status).toBe(200);
      const threadBody = (await thread.json()) as Record<string, unknown>;
      // Host-app data stays internal.
      expect(threadBody.requesterExternalId).toBeUndefined();
      expect(threadBody.context).toBeUndefined();

      // Searching the inbox by the host app's user ID finds it.
      const found = await listTickets({ teamId: team.id, q: "user_8f2" });
      expect(found.map((row) => row.ticketId)).toEqual([answer.conversationId]);
    });
  });

  it("returns the open chat to a new session and appends instead of creating a second ticket", async () => {
    await withApp(async (origin) => {
      const first = (await (
        await fetch(`${origin}/support-sessions`, json(sessionBody, sessionsKey))
      ).json()) as { token: string };
      const started = (await (
        await fetch(
          `${origin}/public/${team.teamId}/chat`,
          json({ message: "Hello", sessionToken: first.token }),
        )
      ).json()) as { conversationId: string };

      const second = (await (
        await fetch(
          `${origin}/support-sessions`,
          json({ ...sessionBody, context: { page: "/settings" } }, sessionsKey),
        )
      ).json()) as { token: string };
      const opened = (await (
        await fetch(
          `${origin}/public/${team.teamId}/support-sessions/open`,
          json({ token: second.token }),
        )
      ).json()) as { ticket: { ticketId: string; accessToken: string } };
      expect(opened.ticket.ticketId).toBe(started.conversationId);
      expect(opened.ticket.accessToken).toEqual(expect.any(String));

      // A message sent with the session token (e.g. from another tab) lands
      // on the same ticket.
      const again = (await (
        await fetch(
          `${origin}/public/${team.teamId}/chat`,
          json({ message: "Still broken", sessionToken: second.token }),
        )
      ).json()) as { conversationId: string };
      expect(again.conversationId).toBe(started.conversationId);
      const all = await db.query.tickets.findMany();
      expect(all).toHaveLength(1);
      // The latest session's context replaces the old one.
      expect(all[0].context).toEqual({ page: "/settings" });
    });
  });

  it("rejects expired, unknown and other-team session tokens", async () => {
    const other = (await seedTeam(db)).team;
    await updateChatbotSettings(other.id, { enabled: true });
    await withApp(async (origin) => {
      const session = (await (
        await fetch(`${origin}/support-sessions`, json(sessionBody, sessionsKey))
      ).json()) as { token: string };

      const wrongTeam = await fetch(
        `${origin}/public/${other.teamId}/support-sessions/open`,
        json({ token: session.token }),
      );
      expect(wrongTeam.status).toBe(401);
      const unknown = await fetch(
        `${origin}/public/${team.teamId}/chat`,
        json({ message: "hi", sessionToken: "nope" }),
      );
      expect(unknown.status).toBe(401);

      await db
        .update(supportSessions)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(supportSessions.teamId, team.id));
      const expired = await fetch(
        `${origin}/public/${team.teamId}/support-sessions/open`,
        json({ token: session.token }),
      );
      expect(expired.status).toBe(401);
      expect(await db.query.tickets.findMany()).toHaveLength(0);
    });
  });

  it("limits a support-sessions key to minting sessions", async () => {
    await withApp(async (origin) => {
      const tickets = await fetch(`${origin}/tickets`, {
        headers: { "x-frontlit-apikey": sessionsKey },
      });
      expect(tickets.status).toBe(403);
      const create = await fetch(
        `${origin}/tickets`,
        json(
          { subject: "x", message: "y", requesterEmail: "a@example.com" },
          sessionsKey,
        ),
      );
      expect(create.status).toBe(403);
      const mcp = await fetch(`${origin}/mcp`, json({}, sessionsKey));
      expect(mcp.status).toBe(403);

      // A full key can mint sessions too, and still reads the inbox.
      const minted = await fetch(
        `${origin}/support-sessions`,
        json(sessionBody, fullKey),
      );
      expect(minted.status).toBe(201);
      const list = await fetch(`${origin}/tickets`, {
        headers: { "x-frontlit-apikey": fullKey },
      });
      expect(list.status).toBe(200);
    });
  });

  it("gives the Chatbot page what the embed snippet needs", async () => {
    process.env.EMBED_ORIGIN = "https://embed.example.test";
    await withApp(async (origin) => {
      const response = await fetch(`${origin}/chatbot`, {
        headers: { "x-frontlit-apikey": fullKey },
      });
      expect(response.status).toBe(200);
      expect(((await response.json()) as { embed: unknown }).embed).toEqual({
        teamId: team.teamId,
        origin: "https://embed.example.test",
      });
    });
    delete process.env.EMBED_ORIGIN;
  });

  it("rejects oversized context and requires an API key", async () => {
    await withApp(async (origin) => {
      const big = await fetch(
        `${origin}/support-sessions`,
        json({ ...sessionBody, context: { blob: "x".repeat(9000) } }, sessionsKey),
      );
      expect(big.status).toBe(400);
      const anonymous = await fetch(`${origin}/support-sessions`, json(sessionBody));
      expect(anonymous.status).toBe(401);
    });
  });
});
