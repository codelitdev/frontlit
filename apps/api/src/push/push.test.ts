import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeTestDb, seedTeam, truncateAll, type TestDb } from "../test/db";
import { authHeaders, listenApp, principalFromHeader } from "../test/auth-app";

const sent = vi.hoisted(
  () => [] as Array<{ endpoint: string; payload: string; options: any }>,
);
const failures = vi.hoisted(() => new Map<string, number>());
const aiOutcome = vi.hoisted(() => ({ answered: false }));

vi.mock("../db/client", async () => ({ db: await makeTestDb() }));
vi.mock("../auth/resolve-auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../auth/resolve-auth")>();
  return {
    ...actual,
    resolveAuth: async (input: { headers?: Record<string, unknown> }) => {
      const header = input.headers?.["x-test-principal"];
      const value = Array.isArray(header) ? header[0] : header;
      return principalFromHeader(typeof value === "string" ? value : undefined);
    },
  };
});
vi.mock("../tickets/notify", () => ({
  notifyTeamOfRequesterMessage: vi.fn().mockResolvedValue(undefined),
  notifyRequesterOfReply: vi.fn().mockResolvedValue(undefined),
  notifyRequesterOfTicketCreated: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../inbox-ai/generate", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../inbox-ai/generate")>();
  return {
    ...actual,
    runInboxAi: async (input: Parameters<typeof actual.runInboxAi>[0]) =>
      aiOutcome.answered
        ? { outcome: "answered", answer: "Here you go." }
        : actual.runInboxAi(input),
  };
});
vi.mock("web-push", () => {
  class WebPushError extends Error {
    constructor(
      message: string,
      public statusCode: number,
    ) {
      super(message);
    }
  }
  return {
    WebPushError,
    default: {
      sendNotification: async (
        subscription: { endpoint: string },
        payload: string,
        options: unknown,
      ) => {
        const status = failures.get(subscription.endpoint);
        if (status) throw new WebPushError("push failed", status);
        sent.push({ endpoint: subscription.endpoint, payload, options });
        return { statusCode: 201 };
      },
    },
  };
});

import { eq } from "drizzle-orm";
import { db as testDb } from "../db/client";
import {
  accounts,
  outboxJobs,
  pushSubscriptions,
  teamMembers,
  tickets,
} from "../db/schema";
import { updateChatbotSettings } from "../chatbot/queries";
import { addTicketMessage, textTicketMessage } from "../tickets/queries";
import { processWebPush } from "./send";

const db = testDb as unknown as TestDb;

const VAPID = {
  VAPID_PUBLIC_KEY: "BPublicKeyForTests",
  VAPID_PRIVATE_KEY: "private-key-for-tests",
  VAPID_SUBJECT: "mailto:ops@example.com",
};

function setVapid(on: boolean) {
  for (const [key, value] of Object.entries(VAPID)) {
    if (on) process.env[key] = value;
    else delete process.env[key];
  }
}

async function addMember(teamId: string, permissions: string[]) {
  const [account] = await db
    .insert(accounts)
    .values({ email: `agent-${crypto.randomUUID()}@example.com` })
    .returning();
  await db.insert(teamMembers).values({ teamId, accountId: account.id, permissions });
  return account;
}

async function subscribe(accountId: string, endpoint: string) {
  await db
    .insert(pushSubscriptions)
    .values({ accountId, endpoint, p256dh: "p256", auth: "auth" });
}

async function pushJobs() {
  return db.query.outboxJobs.findMany({ where: eq(outboxJobs.type, "web_push") });
}

describe("push subscriptions API", () => {
  let owner: Awaited<ReturnType<typeof seedTeam>>["account"];
  let team: Awaited<ReturnType<typeof seedTeam>>["team"];

  beforeEach(async () => {
    await truncateAll(db);
    ({ account: owner, team } = await seedTeam(db));
    setVapid(true);
  });
  afterEach(() => setVapid(false));

  async function withApp(run: (origin: string) => Promise<void>) {
    const listening = await listenApp();
    try {
      await run(listening.origin);
    } finally {
      await listening.close();
    }
  }

  const session = () =>
    authHeaders({ kind: "session", accountId: owner.id, email: owner.email });

  it("reports the public key, or null when push isn't configured", async () => {
    await withApp(async (origin) => {
      const on = await fetch(`${origin}/push-subscriptions/config`, {
        headers: session(),
      });
      expect(on.status).toBe(200);
      expect(await on.json()).toEqual({ publicKey: VAPID.VAPID_PUBLIC_KEY });

      setVapid(false);
      const off = await fetch(`${origin}/push-subscriptions/config`, {
        headers: session(),
      });
      expect(await off.json()).toEqual({ publicKey: null });
    });
  });

  it("saves a browser's subscription once per endpoint and deletes it", async () => {
    const endpoint = "https://push.example.com/send/abc";
    await withApp(async (origin) => {
      for (const auth of ["first", "second"]) {
        const saved = await fetch(`${origin}/push-subscriptions`, {
          method: "PUT",
          headers: { ...session(), "user-agent": "Test Browser" },
          body: JSON.stringify({ endpoint, keys: { p256dh: "key", auth } }),
        });
        expect(saved.status).toBe(204);
      }
      const rows = await db.query.pushSubscriptions.findMany();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        accountId: owner.id,
        endpoint,
        p256dh: "key",
        auth: "second",
        userAgent: "Test Browser",
      });

      const removed = await fetch(`${origin}/push-subscriptions/remove`, {
        method: "POST",
        headers: session(),
        body: JSON.stringify({ endpoint }),
      });
      expect(removed.status).toBe(204);
      expect(await db.query.pushSubscriptions.findMany()).toEqual([]);
    });
  });

  it("only removes the signed-in account's own subscription", async () => {
    const other = await addMember(team.id, []);
    await subscribe(other.id, "https://push.example.com/other");
    await withApp(async (origin) => {
      await fetch(`${origin}/push-subscriptions/remove`, {
        method: "POST",
        headers: session(),
        body: JSON.stringify({ endpoint: "https://push.example.com/other" }),
      });
    });
    expect(await db.query.pushSubscriptions.findMany()).toHaveLength(1);
  });

  it("is for signed-in sessions only, not API keys or anonymous callers", async () => {
    await withApp(async (origin) => {
      const anonymous = await fetch(`${origin}/push-subscriptions/config`);
      expect(anonymous.status).toBe(401);
      const apiKey = await fetch(`${origin}/push-subscriptions`, {
        method: "PUT",
        headers: authHeaders({ kind: "apikey", teamId: team.id }, team.teamId),
        body: JSON.stringify({
          endpoint: "https://push.example.com/x",
          keys: { p256dh: "a", auth: "b" },
        }),
      });
      expect(apiKey.status).toBe(403);
    });
    expect(await db.query.pushSubscriptions.findMany()).toEqual([]);
  });
});

describe("pushes for customer messages that need a person", () => {
  let owner: Awaited<ReturnType<typeof seedTeam>>["account"];
  let team: Awaited<ReturnType<typeof seedTeam>>["team"];

  beforeEach(async () => {
    await truncateAll(db);
    ({ account: owner, team } = await seedTeam(db));
    await updateChatbotSettings(team.id, { enabled: true });
    sent.length = 0;
    failures.clear();
    aiOutcome.answered = false;
    setVapid(true);
  });
  afterEach(() => setVapid(false));

  async function emailTicket(aiState: "idle" | "taken_over") {
    const [ticket] = await db
      .insert(tickets)
      .values({
        teamId: team.id,
        subject: "Refund",
        requesterEmail: "jane@example.com",
        requesterName: "Jane",
        source: "email",
        accessTokenHash: "x",
        aiState,
      })
      .returning();
    return ticket;
  }

  it("queues one push when a human owns the ticket", async () => {
    const ticket = await emailTicket("taken_over");
    await addTicketMessage({
      teamId: team.id,
      ticketDbId: ticket.id,
      author: "requester",
      content: textTicketMessage("Any update?"),
    });
    const jobs = await pushJobs();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].payload).toEqual({
      title: "New message from Jane",
      body: "Any update?",
      url: `/?ticket=${ticket.ticketId}`,
      tag: ticket.ticketId,
    });
  });

  it("queues a push when the chat AI leaves a message unanswered", async () => {
    const listening = await listenApp();
    try {
      const response = await fetch(`${listening.origin}/public/${team.teamId}/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: "Where is my invoice?" }),
      });
      expect(response.status).toBe(200);
    } finally {
      await listening.close();
    }
    const jobs = await pushJobs();
    expect(jobs.map((job) => job.payload.title)).toEqual([
      "New message from Website visitor",
    ]);
  });

  it("sends nothing for messages the AI answered or will handle", async () => {
    aiOutcome.answered = true;
    const listening = await listenApp();
    try {
      const response = await fetch(`${listening.origin}/public/${team.teamId}/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: "How do I reset my password?" }),
      });
      expect(response.status).toBe(200);
    } finally {
      await listening.close();
    }

    // An email ticket the AI still handles: the AI run decides later.
    const aiTicket = await emailTicket("idle");
    await addTicketMessage({
      teamId: team.id,
      ticketDbId: aiTicket.id,
      author: "requester",
      content: textTicketMessage("Hello"),
    });
    // Agent replies never alert.
    const agentTicket = await emailTicket("taken_over");
    await addTicketMessage({
      teamId: team.id,
      ticketDbId: agentTicket.id,
      author: "agent",
      authorAccountId: owner.id,
      content: textTicketMessage("On it"),
    });

    expect(await pushJobs()).toEqual([]);
  });

  it("queues nothing when push isn't configured", async () => {
    setVapid(false);
    const ticket = await emailTicket("taken_over");
    await addTicketMessage({
      teamId: team.id,
      ticketDbId: ticket.id,
      author: "requester",
      content: textTicketMessage("Any update?"),
    });
    expect(await pushJobs()).toEqual([]);
  });

  it("sends to agents who can read the help desk and drops gone subscriptions", async () => {
    const agent = await addMember(team.id, ["helpdesk:read"]);
    const writer = await addMember(team.id, ["pages:write"]);
    const outsider = await seedTeam(db);
    await subscribe(owner.id, "https://push.example.com/owner");
    await subscribe(agent.id, "https://push.example.com/agent");
    await subscribe(agent.id, "https://push.example.com/agent-old");
    await subscribe(writer.id, "https://push.example.com/writer");
    await subscribe(outsider.account.id, "https://push.example.com/outsider");
    failures.set("https://push.example.com/agent-old", 410);

    const payload = {
      title: "New message from Jane",
      body: "Any update?",
      url: "/?ticket=tkt_1",
      tag: "tkt_1",
    };
    await processWebPush(team.id, payload);

    expect(sent.map((push) => push.endpoint).sort()).toEqual([
      "https://push.example.com/agent",
      "https://push.example.com/owner",
    ]);
    expect(JSON.parse(sent[0].payload)).toEqual(payload);
    expect(sent[0].options.vapidDetails).toEqual({
      publicKey: VAPID.VAPID_PUBLIC_KEY,
      privateKey: VAPID.VAPID_PRIVATE_KEY,
      subject: VAPID.VAPID_SUBJECT,
    });
    const left = await db.query.pushSubscriptions.findMany();
    expect(left.map((row) => row.endpoint).sort()).toEqual([
      "https://push.example.com/agent",
      "https://push.example.com/outsider",
      "https://push.example.com/owner",
      "https://push.example.com/writer",
    ]);
  });

  it("throws so the outbox retries when a push service is unavailable", async () => {
    await subscribe(owner.id, "https://push.example.com/owner");
    failures.set("https://push.example.com/owner", 503);
    await expect(
      processWebPush(team.id, { title: "t", body: "b", url: "/", tag: "x" }),
    ).rejects.toThrow(/Web push failed/);
    expect(await db.query.pushSubscriptions.findMany()).toHaveLength(1);
  });
});
