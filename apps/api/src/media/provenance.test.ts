import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeTestDb, seedTeam, type TestDb } from "../test/db";
vi.mock("../db/client", async () => ({ db: await makeTestDb() }));
vi.mock("./service", () => ({
  mediaLitBindsSignedGroups: vi.fn(async () => true),
  getMedia: vi.fn(),
  sealMedia: vi.fn(),
  getMediaUploadSignature: vi.fn(async () => ({
    signature: "test",
    endpoint: "https://provider.invalid",
  })),
}));
import { db as testDb } from "../db/client";
import { mediaUploadIntents, media } from "../db/schema";
import { getMedia, sealMedia, mediaLitBindsSignedGroups } from "./service";
import { createLibraryUploadIntent, registerVerifiedMedia } from "./provenance";
import { eq } from "drizzle-orm";
const db = testDb as unknown as TestDb;
describe("D2 provider-verified media provenance", () => {
  let teamId: string;
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(mediaLitBindsSignedGroups).mockResolvedValue(true);
    teamId = (await seedTeam(db)).team.id;
  });
  async function upload() {
    const intent = await createLibraryUploadIntent(teamId);
    const row = (await db.query.mediaUploadIntents.findFirst({
      where: eq(mediaUploadIntents.intentId, intent.intentId),
    }))!;
    return {
      intent,
      row,
      provider: {
        mediaId: "provider-id",
        originalFileName: "verified.png",
        mimeType: "image/png",
        size: 24,
        access: "public" as const,
        file: "https://cdn.invalid/verified.png",
        group: row.providerGroup,
      },
    };
  }
  it("fails closed when the provider does not bind signed upload groups", async () => {
    vi.mocked(mediaLitBindsSignedGroups).mockResolvedValue(false);
    await expect(createLibraryUploadIntent(teamId)).rejects.toMatchObject({
      status: 503,
      code: "MEDIA_GROUP_BINDING_UNAVAILABLE",
    });
    expect(
      await db.query.mediaUploadIntents.findMany({
        where: eq(mediaUploadIntents.teamId, teamId),
      }),
    ).toHaveLength(0);
    expect(getMedia).not.toHaveBeenCalled();
    expect(sealMedia).not.toHaveBeenCalled();
  });
  it("checks the exact provider group before sealing and ignores forged MIME metadata", async () => {
    const { intent, provider } = await upload();
    vi.mocked(getMedia).mockResolvedValue({ ...provider, group: "ticket-private" });
    await expect(
      registerVerifiedMedia({
        teamId,
        mediaLitId: provider.mediaId,
        intentId: intent.intentId,
      }),
    ).rejects.toThrow();
    expect(sealMedia).not.toHaveBeenCalled();
    expect(
      await db.query.media.findMany({ where: eq(media.teamId, teamId) }),
    ).toHaveLength(0);
  });
  it("rejects foreign intents and client URLs before sealing", async () => {
    const { intent, provider } = await upload();
    vi.mocked(getMedia).mockResolvedValue(provider);
    const other = (await seedTeam(db)).team.id;
    await expect(
      registerVerifiedMedia({
        teamId: other,
        mediaLitId: provider.mediaId,
        intentId: intent.intentId,
      }),
    ).rejects.toThrow();
    await expect(
      registerVerifiedMedia({
        teamId,
        mediaLitId: provider.mediaId,
        intentId: intent.intentId,
        url: "https://forged.invalid/image.png",
      }),
    ).rejects.toThrow();
    expect(sealMedia).not.toHaveBeenCalled();
  });
  it("registers canonical provider metadata and is idempotent for the same object", async () => {
    const { intent, provider } = await upload();
    vi.mocked(getMedia).mockResolvedValue(provider);
    const first = await registerVerifiedMedia({
      teamId,
      intentId: intent.intentId,
      mediaLitId: provider.mediaId,
    });
    expect(first.url).toBe(provider.file);
    expect(first.mimeType).toBe("image/png");
    expect(first.verifiedAt).toBeInstanceOf(Date);
    const second = await registerVerifiedMedia({
      teamId,
      intentId: intent.intentId,
      mediaLitId: provider.mediaId,
    });
    expect(second.mediaId).toBe(first.mediaId);
    expect(sealMedia).toHaveBeenCalledTimes(1);
  });
  it("refuses private legacy objects without upgrading them", async () => {
    const { provider } = await upload();
    vi.mocked(getMedia).mockResolvedValue({
      ...provider,
      group: teamId,
      access: "private",
    });
    await expect(
      registerVerifiedMedia({ teamId, mediaLitId: provider.mediaId }),
    ).rejects.toThrow();
    expect(sealMedia).not.toHaveBeenCalled();
  });
  it("returns a retryable verification failure without manufacturing ownership", async () => {
    const { intent, provider } = await upload();
    vi.mocked(getMedia).mockRejectedValue(new Error("Offline"));
    await expect(
      registerVerifiedMedia({
        teamId,
        intentId: intent.intentId,
        mediaLitId: provider.mediaId,
      }),
    ).rejects.toMatchObject({ status: 503, code: "MEDIA_PROVIDER_UNAVAILABLE" });
    expect(
      await db.query.media.findMany({ where: eq(media.teamId, teamId) }),
    ).toHaveLength(0);
    expect(sealMedia).not.toHaveBeenCalled();
  });
});
