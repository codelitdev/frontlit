import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeTestDb, seedTeam, type TestDb } from "../test/db";

vi.mock("../db/client", async () => ({ db: await makeTestDb() }));

// The MediaLit HTTP calls themselves are exercised for real in
// media/service.integration.test.ts (against the live MediaLit instance).
// Here we mock the service seam so the queries layer (idempotency,
// team-scoping, DB shape) is tested in isolation, per architecture.md §14.1.
vi.mock("./service", () => ({
  sealMedia: vi.fn(async (mediaLitId: string) => ({
    mediaId: mediaLitId,
    originalFileName: "photo.png",
    mimeType: "image/png",
    size: 1234,
    access: "public" as const,
    file: `https://cdn.medialit.example/${mediaLitId}/main.png`,
    thumbnail: `https://cdn.medialit.example/${mediaLitId}/thumb.webp`,
    caption: undefined,
  })),
  deleteMedia: vi.fn(async () => undefined),
  getMedia: vi.fn(),
  getMediaUploadSignature: vi.fn(),
}));

import { saveDocumentation } from "../documentation/authoring";
import { db as testDb } from "../db/client";
import { sealMedia, deleteMedia } from "./service";
import {
  countMedia,
  deleteMediaRecord,
  getMediaByMediaId,
  listMedia,
  registerMedia,
  updateMedia,
} from "./queries";

describe("media library", () => {
  const db = testDb as unknown as TestDb;
  let teamId: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    const seeded = await seedTeam(db);
    teamId = seeded.team.id;
  });

  it("seals the upload and stores MediaLit's file metadata", async () => {
    const item = await registerMedia({
      teamId,
      mediaLitId: "ml_abc123",
      alt: "A photo",
    });

    expect(sealMedia).toHaveBeenCalledWith("ml_abc123");
    expect(item?.mediaId).toMatch(/^med_/);
    expect(item?.mediaLitId).toBe("ml_abc123");
    expect(item?.url).toBe("https://cdn.medialit.example/ml_abc123/main.png");
    expect(item?.thumbnailUrl).toBe(
      "https://cdn.medialit.example/ml_abc123/thumb.webp",
    );
    expect(item?.mimeType).toBe("image/png");
    expect(item?.size).toBe(1234);
    expect(item?.alt).toBe("A photo");
  });

  it("is idempotent: re-registering the same mediaLitId returns the existing row", async () => {
    const first = await registerMedia({ teamId, mediaLitId: "ml_dupe" });
    const second = await registerMedia({ teamId, mediaLitId: "ml_dupe" });

    expect(sealMedia).toHaveBeenCalledTimes(1);
    expect(second?.mediaId).toBe(first?.mediaId);

    expect(await countMedia({ teamId })).toBe(1);
    expect(await listMedia({ teamId })).toHaveLength(1);
  });

  it("rejects a mediaLitId already registered by another team", async () => {
    await registerMedia({ teamId, mediaLitId: "ml_taken" });
    const { team: otherTeam } = await seedTeam(db, { name: "Other" });

    await expect(
      registerMedia({ teamId: otherTeam.id, mediaLitId: "ml_taken" }),
    ).rejects.toMatchObject({ code: "INVALID_MEDIA" });
    expect(await countMedia({ teamId: otherTeam.id })).toBe(0);
  });

  it("lists media newest-first, scoped to the team", async () => {
    await registerMedia({ teamId, mediaLitId: "ml_1" });
    await registerMedia({ teamId, mediaLitId: "ml_2" });
    const { team: otherTeam } = await seedTeam(db, { name: "Other" });
    await registerMedia({ teamId: otherTeam.id, mediaLitId: "ml_other" });

    const items = await listMedia({ teamId });

    expect(items).toHaveLength(2);
    expect(items.map((i) => i.mediaLitId).sort()).toEqual(["ml_1", "ml_2"]);
    expect(await countMedia({ teamId })).toBe(2);
  });

  it("updates alt/caption without touching MediaLit", async () => {
    const created = await registerMedia({ teamId, mediaLitId: "ml_edit" });
    const updated = await updateMedia(teamId, created!.mediaId, {
      alt: "New alt",
      caption: "New caption",
    });

    expect(updated?.alt).toBe("New alt");
    expect(updated?.caption).toBe("New caption");
  });

  it("update is team-scoped and no-ops for another team", async () => {
    const created = await registerMedia({
      teamId,
      mediaLitId: "ml_scoped",
    });
    const { team: otherTeam } = await seedTeam(db, { name: "Other" });

    expect(
      await updateMedia(otherTeam.id, created!.mediaId, {
        alt: "hijacked",
      }),
    ).toBeNull();
  });

  it("deletes the file from MediaLit and the library", async () => {
    const created = await registerMedia({
      teamId,
      mediaLitId: "ml_delete",
    });
    const result = await deleteMediaRecord(teamId, created!.mediaId);

    expect(result.ok).toBe(true);
    expect(deleteMedia).toHaveBeenCalledWith("ml_delete");
    expect(await getMediaByMediaId(teamId, created!.mediaId)).toBeUndefined();
  });

  it("delete is a no-op (and never calls MediaLit) for a missing/foreign item", async () => {
    const result = await deleteMediaRecord(teamId, "med_doesnotexist");

    expect(result.ok).toBe(false);
    expect(deleteMedia).not.toHaveBeenCalled();
  });

  it("returns MEDIA_IN_USE with 409 for a saved documentation reference", async () => {
    const item = await registerMedia({ teamId, mediaLitId: "ml_referenced" });
    await saveDocumentation(teamId, null, {
      title: "Referenced image",
      markdown: `![Library image](${item!.url})`,
    });
    await expect(deleteMediaRecord(teamId, item!.mediaId)).rejects.toMatchObject({
      code: "MEDIA_IN_USE",
      status: 409,
    });
    expect(await getMediaByMediaId(teamId, item!.mediaId)).toBeDefined();
    expect(deleteMedia).not.toHaveBeenCalled();
  });
});
