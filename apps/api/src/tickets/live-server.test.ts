import type { AddressInfo } from "node:net";
import { beforeEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import { makeTestDb, seedTeam, truncateAll, type TestDb } from "../test/db";

vi.mock("../db/client", async () => ({ db: await makeTestDb() }));
vi.mock("./notify", () => ({
  notifyTeamOfRequesterMessage: vi.fn().mockResolvedValue(undefined),
  notifyRequesterOfReply: vi.fn().mockResolvedValue(undefined),
  notifyRequesterOfTicketCreated: vi.fn().mockResolvedValue(undefined),
}));

import { db as testDb } from "../db/client";
import { createApp } from "../app";
import { updateChatbotSettings } from "../chatbot/queries";
import { publishInboxUpdate } from "./live";
import { attachInboxLive, LIVE_UNAUTHORIZED } from "./live-server";

const db = testDb as unknown as TestDb;

describe("visitor live stream", () => {
  let team: Awaited<ReturnType<typeof seedTeam>>["team"];

  beforeEach(async () => {
    await truncateAll(db);
    ({ team } = await seedTeam(db));
    await updateChatbotSettings(team.id, { enabled: true });
  });

  async function withServer(
    run: (origin: string, chat: { id: string; token: string }) => Promise<void>,
  ) {
    const server = createApp().listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const wss = attachInboxLive(server, { authTimeoutMs: 300 });
    const { port } = server.address() as AddressInfo;
    const origin = `http://127.0.0.1:${port}`;
    try {
      const response = await fetch(`${origin}/public/${team.teamId}/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: "Hello" }),
      });
      const body = (await response.json()) as {
        conversationId: string;
        conversationToken: string;
      };
      await run(origin, { id: body.conversationId, token: body.conversationToken });
    } finally {
      for (const client of wss.clients) client.terminate();
      wss.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }

  function open(origin: string, ticketId: string) {
    const url = new URL(`${origin.replace(/^http/, "ws")}/public/stream`);
    url.searchParams.set("teamId", team.teamId);
    url.searchParams.set("ticketId", ticketId);
    const ws = new WebSocket(url);
    const messages: unknown[] = [];
    ws.on("message", (data) => messages.push(JSON.parse(String(data))));
    const closed = new Promise<number>((resolve) => ws.on("close", resolve));
    const opened = new Promise<void>((resolve, reject) => {
      ws.once("open", () => resolve());
      ws.once("error", reject);
    });
    return { ws, messages, closed, opened };
  }

  it("follows the ticket after an auth message with its token", async () => {
    await withServer(async (origin, chat) => {
      const client = open(origin, chat.id);
      await client.opened;
      // Messages other than auth are ignored before auth.
      client.ws.send(JSON.stringify({ type: "hello" }));
      client.ws.send(JSON.stringify({ type: "auth", token: chat.token }));
      await vi.waitFor(() => {
        publishInboxUpdate(team.id, chat.id);
        expect(client.messages).toContainEqual({ type: "ticket.updated" });
      });
      // Past the auth timeout, the authenticated socket stays open.
      await new Promise((resolve) => setTimeout(resolve, 400));
      expect(client.ws.readyState).toBe(WebSocket.OPEN);
      client.ws.close();
    });
  });

  it("closes with 4401 on a bad token", async () => {
    await withServer(async (origin, chat) => {
      const client = open(origin, chat.id);
      await client.opened;
      client.ws.send(JSON.stringify({ type: "auth", token: "nope" }));
      expect(await client.closed).toBe(LIVE_UNAUTHORIZED);
      publishInboxUpdate(team.id, chat.id);
      expect(client.messages).toEqual([]);
    });
  });

  it("closes with 4401 when no auth message arrives in time", async () => {
    await withServer(async (origin, chat) => {
      const client = open(origin, chat.id);
      await client.opened;
      expect(await client.closed).toBe(LIVE_UNAUTHORIZED);
    });
  });
});
