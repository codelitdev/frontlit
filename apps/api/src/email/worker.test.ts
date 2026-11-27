import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeTestDb, seedTeam, truncateAll, type TestDb } from "../test/db";

vi.mock("../db/client", async () => ({ db: await makeTestDb() }));
vi.mock("../integrations/queries", () => ({
  getSendlitApiKey: vi.fn().mockResolvedValue("sl_key"),
}));
vi.mock("./sendlit-client", () => ({
  upsertContact: vi.fn(),
  updateContact: vi.fn(),
  addContactTag: vi.fn(),
}));

import { db as testDb } from "../db/client";
import { tickets } from "../db/schema";
import { createTicket } from "../tickets/queries";
import { addContactTag, updateContact, upsertContact } from "./sendlit-client";
import { processContactSync, requesterCustomFields } from "./worker";

const db = testDb as unknown as TestDb;

describe("contact_sync (docs/embedded-support.md §6.4)", () => {
  beforeEach(async () => {
    await truncateAll(db);
    vi.mocked(upsertContact).mockReset();
    vi.mocked(updateContact).mockReset();
    vi.mocked(addContactTag).mockReset();
  });

  it("maps the host app's user and account to custom fields", () => {
    expect(
      requesterCustomFields({
        externalId: "user_1",
        account: { id: "s1", name: "Acme", url: "https://acme.example.com" },
      }),
    ).toEqual({
      externalId: "user_1",
      accountId: "s1",
      accountName: "Acme",
      accountUrl: "https://acme.example.com",
    });
    expect(requesterCustomFields({ email: "a@example.com" })).toBeNull();
  });

  it("merges custom fields into an existing contact, tags it, and links the ticket", async () => {
    const { team } = await seedTeam(db);
    const { ticket } = await createTicket({
      teamId: team.id,
      subject: "Upload failed",
      message: "Upload failed",
      requesterEmail: "jane@example.com",
      source: "chatbot",
      scheduleAi: false,
      sendReceipt: false,
    });
    vi.mocked(upsertContact).mockResolvedValue({
      contactId: "ct_1",
      email: "jane@example.com",
      tags: [],
      subscribed: true,
      customFields: { plan: "pro", externalId: "old" },
    });

    await processContactSync(team.id, {
      email: "jane@example.com",
      sourcePath: "/chat",
      ticketId: ticket.id,
      externalId: "user_1",
      account: { id: "s1", name: "Acme" },
    });

    expect(upsertContact).toHaveBeenCalledWith("sl_key", {
      email: "jane@example.com",
      customFields: { externalId: "user_1", accountId: "s1", accountName: "Acme" },
    });
    expect(updateContact).toHaveBeenCalledWith("sl_key", "ct_1", {
      customFields: {
        plan: "pro",
        externalId: "user_1",
        accountId: "s1",
        accountName: "Acme",
      },
    });
    const tags = vi.mocked(addContactTag).mock.calls.map((call) => call[2]);
    expect(tags).toEqual(["frontlit", "source:in-app", "source:chat"]);
    const linked = await db.query.tickets.findFirst({
      where: eq(tickets.id, ticket.id),
    });
    expect(linked?.contactId).toBe("ct_1");
  });

  it("leaves a plain lead alone", async () => {
    const { team } = await seedTeam(db);
    vi.mocked(upsertContact).mockResolvedValue({
      contactId: "ct_2",
      email: "lead@example.com",
      tags: [],
      subscribed: true,
    });
    await processContactSync(team.id, {
      email: "lead@example.com",
      sourcePath: "/pricing",
    });
    expect(updateContact).not.toHaveBeenCalled();
    expect(vi.mocked(addContactTag).mock.calls.map((call) => call[2])).toEqual([
      "frontlit",
      "source:pricing",
    ]);
  });
});
