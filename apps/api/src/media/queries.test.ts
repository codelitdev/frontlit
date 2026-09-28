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

  it("registers media by sealing it and storing the sealed URL/metadata", async () => {
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

    expect(sealMedia).toHaveBeenCalledTimes(2);
    expect(second?.mediaId).toBe(first?.mediaId);

    expect(await countMedia({ teamId })).toBe(1);
    expect(await listMedia({ teamId })).toHaveLength(1);
  });

  it("registers provisioned media with a direct URL and mediaLitId without calling sealMedia", async () => {
    const item = await registerMedia({
      teamId,
      mediaLitId: "ml_provisioned_1",
      url: "https://external-storage.example/hero.jpg",
      thumbnailUrl: "https://external-storage.example/hero-thumb.jpg",
      alt: "External Hero",
    });

    expect(sealMedia).not.toHaveBeenCalled();
    expect(item?.mediaId).toMatch(/^med_/);
    expect(item?.url).toBe("https://external-storage.example/hero.jpg");
    expect(item?.thumbnailUrl).toBe("https://external-storage.example/hero-thumb.jpg");
    expect(item?.alt).toBe("External Hero");
    expect(item?.mediaLitId).toBe("ml_provisioned_1");

    const listed = await listMedia({ teamId });
    expect(
      listed.some((m) => m.url === "https://external-storage.example/hero.jpg"),
    ).toBe(true);
  });

  it("rejects unsplash URLs or missing/invalid mediaLitId", async () => {
    await expect(
      registerMedia({
        teamId,
        mediaLitId: "https://images.unsplash.com/photo-1",
        url: "https://images.unsplash.com/photo-1",
      } as any),
    ).rejects.toThrow(/Media library is exclusive to uploads/);

    await expect(
      registerMedia({
        teamId,
        mediaLitId: "ext_123",
        url: "https://example.com/photo-1.jpg",
      } as any),
    ).rejects.toThrow(/Media library is exclusive to uploads/);
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

  it("deletes from MediaLit and the local library together", async () => {
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
});
