import "dotenv/config";
import { describe, expect, it, vi } from "vitest";
import { makeTestDb, seedTeam, type TestDb } from "../test/db";
vi.mock("../db/client", async () => ({ db: await makeTestDb() }));
import { eq } from "drizzle-orm";
import { db as appDb } from "../db/client";
import { media } from "../db/schema";
import { getMedia, getMediaUploadSignature, sealMedia, deleteMedia } from "./service";
import { registerVerifiedMedia } from "./provenance";
import { getDocsSettings, saveDocumentation } from "../documentation/authoring";
import {
  processPublication,
  queuePublication,
  readDocumentation,
  reconcileDocumentationMedia,
} from "../documentation/publications";

const db = appDb as unknown as TestDb;
const enabled = Boolean(process.env.MEDIALIT_APIKEY && process.env.MEDIALIT_SERVER);
const pixel = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXioAAAAASUVORK5CYII=",
  "base64",
);

async function upload(group: string) {
  const { signature, endpoint } = await getMediaUploadSignature(group);
  const metadata = Object.entries({
    fileName: "frontlit-provider-guarantee.png",
    mimeType: "image/png",
    access: "public",
  })
    .map(([key, value]) => `${key} ${Buffer.from(value).toString("base64")}`)
    .join(",");
  const create = await fetch(`${endpoint}/media/create/resumable`, {
    method: "POST",
    headers: {
      "Tus-Resumable": "1.0.0",
      "Upload-Length": String(pixel.length),
      "Upload-Metadata": metadata,
      "x-medialit-signature": signature,
    },
  });
  expect(create.status).toBe(201);
  const location = new URL(create.headers.get("location")!, endpoint).href;
  const patch = await fetch(location, {
    method: "PATCH",
    headers: {
      "Tus-Resumable": "1.0.0",
      "Upload-Offset": "0",
      "Content-Type": "application/offset+octet-stream",
      "x-medialit-signature": signature,
    },
    body: pixel,
  });
  expect(patch.status).toBe(204);
  return JSON.parse(patch.headers.get("Media")!).mediaId as string;
}

// V37/V39 against the actual MediaLit provider. Provider objects use unique
// test groups and are deleted by the test itself.
describe.skipIf(!enabled)("DM-MEDIA provider guarantees (live)", () => {
  it("refuses forged media before sealing or storing a row", async () => {
    const { team } = await seedTeam(db);
    const forged = `${crypto.randomUUID().replaceAll("-", "")}`;
    await expect(getMedia(forged)).rejects.toMatchObject({ status: 404 });
    await expect(
      registerVerifiedMedia({ teamId: team.id, mediaLitId: forged }),
    ).rejects.toMatchObject({
      code: expect.stringMatching(
        /UNVERIFIED_MEDIA|MEDIA_GROUP_BINDING_UNAVAILABLE|MEDIA_PROVIDER_UNAVAILABLE/,
      ),
    });
    await expect(
      registerVerifiedMedia({ teamId: team.id, mediaLitId: "https://evil.test/x.png" }),
    ).rejects.toMatchObject({ code: "UNVERIFIED_MEDIA" });
    expect(await db.query.media.findMany({ where: eq(media.teamId, team.id) })).toEqual(
      [],
    );
  }, 30000);

  it("completes provider deletion and hides dependent docs only after confirmed access loss", async () => {
    const { team } = await seedTeam(db);
    let id: string | undefined;
    try {
      id = await upload(team.id);
      await sealMedia(id);
      const provider = await getMedia(id);
      expect(provider.access).toBe("public");
      await db.insert(media).values({
        teamId: team.id,
        mediaLitId: id,
        url: provider.file,
        providerGroup: provider.group,
        access: "public",
        verifiedAt: new Date(),
      });
      const doc = (await saveDocumentation(team.id, null, {
        title: "Live asset",
        slug: "live-asset",
        markdown: "## Image\n\nUses a managed asset.",
        featuredImage: { url: provider.file },
      }))!;
      const s = await getDocsSettings(team.id);
      await queuePublication(team.id, {
        selected: [
          { documentId: doc.documentId, expectedDraftVersion: doc.draftVersion },
        ],
        removals: [],
        expectedPublicationId: s.activePublicationId,
        expectedDocsDraftVersion: s.draftVersion,
        idempotencyKey: "live-asset",
      });
      expect(await processPublication(team.id)).toMatchObject({ status: "active" });

      // Unchanged provider state keeps the doc served.
      await reconcileDocumentationMedia(1000);
      expect((await readDocumentation(team.id)).items).toHaveLength(1);

      // Provider deletion completes: the object is gone from the provider.
      await deleteMedia(id);
      await expect(getMedia(id)).rejects.toMatchObject({ status: 404 });
      const deletedId = id;
      id = undefined;

      // The confirmed provider signal hides the affected doc.
      await reconcileDocumentationMedia(1000);
      expect((await readDocumentation(team.id)).items).toEqual([]);
      expect(
        (await db.query.media.findFirst({ where: eq(media.mediaLitId, deletedId) }))
          ?.verifiedAt,
      ).toBeTruthy();
    } finally {
      if (id) await deleteMedia(id);
    }
  }, 60000);
});
