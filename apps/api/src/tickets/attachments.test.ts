import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeTestDb, seedTeam, type TestDb } from "../test/db";

vi.mock("../db/client", async () => ({
  db: await makeTestDb(),
  sqlTransactionsEnabled: false,
}));
vi.mock("../media/service", () => ({
  getMediaUploadSignature: vi.fn(async () => ({
    signature: "sig",
    endpoint: "https://media.example",
  })),
  getMedia: vi.fn(async () => ({
    mediaId: "ml_temp",
    originalFileName: "shot.png",
    mimeType: "image/png",
    size: 1200,
    access: "private",
    file: "https://media.example/temp/shot.png",
    thumbnail: null,
  })),
  sealMedia: vi.fn(async () => ({
    mediaId: "ml_1",
    originalFileName: "shot.png",
    mimeType: "image/png",
    size: 1200,
    access: "private",
    file: "https://media.example/shot.png",
    thumbnail: "https://media.example/shot-thumb.png",
  })),
}));

import { db as testDb } from "../db/client";
import { createTicket, getTicketMessages } from "./queries";
import { sealMedia } from "../media/service";
import {
  attachFilesToMessage,
  attachmentsByMessage,
  registerTicketAttachment,
} from "./attachments";

describe("ticket attachments", () => {
  const db = testDb as unknown as TestDb;
  let teamId: string;

  beforeEach(async () => {
    const seeded = await seedTeam(db);
    teamId = seeded.team.id;
  });

  it("stores a MediaLit file on the ticket without a library row", async () => {
    const created = await createTicket({
      teamId,
      subject: "Chat",
      message: "see this",
      requesterEmail: null,
      source: "chatbot",
      scheduleAi: false,
    });
    const row = await registerTicketAttachment({
      teamId,
      ticketDbId: created.ticket.id,
      mediaLitId: "temp_1",
    });
    expect(row.attachmentId.startsWith("att_")).toBe(true);
    expect(row.messageId).toBeNull();
    expect(row.fileName).toBe("shot.png");
    expect(sealMedia).not.toHaveBeenCalled();

    const [message] = await getTicketMessages(created.ticket.id);
    await attachFilesToMessage({
      teamId,
      ticketDbId: created.ticket.id,
      messageDbId: message.id,
      attachmentIds: [row.attachmentId],
    });
    expect(sealMedia).toHaveBeenCalledWith("ml_temp");
    const byMessage = await attachmentsByMessage(created.ticket.id);
    expect(byMessage.get(message.id)?.[0]?.attachmentId).toBe(row.attachmentId);
    expect(byMessage.get(message.id)?.[0]?.url).toBe("https://media.example/shot.png");
  });
});
