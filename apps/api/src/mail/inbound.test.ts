import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { makeTestDb, seedTeam, type TestDb } from "../test/db";

vi.mock("../db/client", async () => ({ db: await makeTestDb() }));
vi.mock("../tickets/notify", () => ({
  notifyRequesterOfTicketCreated: vi.fn().mockResolvedValue(undefined),
  notifyTeamOfRequesterMessage: vi.fn().mockResolvedValue(undefined),
}));

import { db as testDb } from "../db/client";
import { tickets } from "../db/schema";
import { getTicketMessages } from "../tickets/queries";
import { processInboundMail } from "./inbound";
import { lookupReplyToken, mintReplyToken } from "./reply-token";

describe("inbound support email", () => {
  const db = testDb as unknown as TestDb;
  let subdomain: string;
  let teamId: string;

  beforeEach(async () => {
    vi.stubEnv("MAIL_DOMAIN", "localhost");
    const seeded = await seedTeam(db);
    teamId = seeded.team.id;
    subdomain = seeded.team.subdomain!;
  });

  it("opens a ticket for a new message to support@subdomain", async () => {
    const result = await processInboundMail({
      from: "Casey <casey@example.com>",
      to: [`support@${subdomain}.localhost`],
      subject: "Site is down",
      text: "The homepage returns 500.\n",
      messageId: "<new-1@example.com>",
    });

    expect(result.status).toBe("created");
    if (result.status !== "created") return;
    const [ticket] = await db
      .select()
      .from(tickets)
      .where(eq(tickets.ticketId, result.ticketId));
    expect(ticket).toMatchObject({
      teamId,
      source: "email",
      requesterEmail: "casey@example.com",
      requesterName: "Casey",
      subject: "Site is down",
    });
  });

  it("appends a reply when In-Reply-To carries the ticket id", async () => {
    const created = await processInboundMail({
      from: "casey@example.com",
      to: [`support@${subdomain}.localhost`],
      subject: "Site is down",
      text: "Still down.",
      messageId: "<new-2@example.com>",
    });
    expect(created.status).toBe("created");
    if (created.status !== "created") return;

    const replied = await processInboundMail({
      from: "casey@example.com",
      to: [`support@${subdomain}.localhost`],
      subject: "Re: Site is down",
      text: "Any update?\n\nOn earlier, support wrote:\n> Still down.",
      messageId: "<reply-2@example.com>",
      inReplyTo: `<${created.ticketId}@${subdomain}.localhost>`,
    });

    expect(replied).toEqual({
      status: "replied",
      ticketId: created.ticketId,
    });
    const ticket = await db.query.tickets.findFirst({
      where: eq(tickets.ticketId, created.ticketId),
    });
    const messages = await getTicketMessages(ticket!.id);
    expect(messages).toHaveLength(2);
    expect(ticket?.status).toBe("open");
  });

  it("rejects a reply whose From does not match the requester", async () => {
    const created = await processInboundMail({
      from: "casey@example.com",
      to: [`support@${subdomain}.localhost`],
      subject: "Site is down",
      text: "Still down.",
      messageId: "<new-mismatch@example.com>",
    });
    expect(created.status).toBe("created");
    if (created.status !== "created") return;

    const replied = await processInboundMail({
      from: "stranger@example.com",
      to: [`support@${subdomain}.localhost`],
      subject: "Re: Site is down",
      text: "Hijack",
      messageId: "<hijack@example.com>",
      inReplyTo: `<${created.ticketId}@${subdomain}.localhost>`,
    });
    expect(replied).toEqual({
      status: "ignored",
      reason: "sender_mismatch",
    });
  });

  it("appends a reply addressed to an opaque reply+ token", async () => {
    vi.stubEnv("INBOUND_EMAIL_DOMAIN", "replies.localhost");
    const created = await processInboundMail({
      from: "casey@example.com",
      to: [`support@${subdomain}.localhost`],
      subject: "Token thread",
      text: "Please help",
      messageId: "<token-new@example.com>",
    });
    expect(created.status).toBe("created");
    if (created.status !== "created") return;

    const token = await mintReplyToken({
      teamId,
      ticketPublicId: created.ticketId,
      requesterEmail: "casey@example.com",
    });
    expect(token).toBeTruthy();
    expect(await lookupReplyToken(token!)).toMatchObject({
      requesterEmail: "casey@example.com",
    });

    const replied = await processInboundMail({
      from: "Casey <casey@example.com>",
      to: [`reply+${token}@replies.localhost`],
      subject: "Re: Token thread",
      text: "Still waiting",
      messageId: "<token-reply@example.com>",
    });
    expect(replied).toEqual({
      status: "replied",
      ticketId: created.ticketId,
    });

    const spoofed = await processInboundMail({
      from: "evil@example.com",
      to: [`reply+${token}@replies.localhost`],
      subject: "Re: Token thread",
      text: "Nope",
      messageId: "<token-spoof@example.com>",
    });
    expect(spoofed).toEqual({
      status: "ignored",
      reason: "sender_mismatch",
    });
  });

  it("ignores mail that is not for a team support address", async () => {
    const result = await processInboundMail({
      from: "casey@example.com",
      to: ["random@example.com"],
      subject: "Hi",
      text: "Hello",
    });
    expect(result).toEqual({
      status: "ignored",
      reason: "not_support_address",
    });
  });

  it("dedupes the same Message-ID", async () => {
    const first = await processInboundMail({
      from: "casey@example.com",
      to: [`support@${subdomain}.localhost`],
      subject: "Hello",
      text: "First",
      messageId: "<dup@example.com>",
    });
    const second = await processInboundMail({
      from: "casey@example.com",
      to: [`support@${subdomain}.localhost`],
      subject: "Hello",
      text: "First",
      messageId: "<dup@example.com>",
    });
    expect(first.status).toBe("created");
    expect(second.status).toBe("duplicate");
  });
});
