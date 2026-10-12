import "dotenv/config";
import { describe, expect, it } from "vitest";
import { getMediaUploadSignature, getMedia, sealMedia, deleteMedia } from "./service";
const enabled = Boolean(process.env.MEDIALIT_APIKEY && process.env.MEDIALIT_SERVER);
const pixel = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXioAAAAASUVORK5CYII=",
  "base64",
);
async function directUpload(
  group: string,
  access: "public" | "private",
  override = true,
) {
  const { signature, endpoint } = await getMediaUploadSignature(group);
  const metadata = Object.entries({
    fileName: "frontlit-d2-provenance.png",
    mimeType: "image/png",
    access,
    ...(override ? { group: "client-forged-group" } : {}),
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
  const upload = await fetch(location, {
    method: "PATCH",
    headers: {
      "Tus-Resumable": "1.0.0",
      "Upload-Offset": "0",
      "Content-Type": "application/offset+octet-stream",
      "x-medialit-signature": signature,
    },
    body: pixel,
  });
  expect(upload.status).toBe(204);
  const uploaded = JSON.parse(upload.headers.get("Media")!);
  return uploaded.mediaId as string;
}
describe.skipIf(!enabled)("DM-MEDIA actual provider behavior", () => {
  it("enforces the signed group, retains it through sealing, and exposes a public canonical URL", async () => {
    const group = `frontlit-library:test:${crypto.randomUUID()}`;
    let id: string | undefined;
    try {
      id = await directUpload(group, "public");
      const before = await getMedia(id);
      expect(before.group).toBe(group);
      expect(before.access).toBe("public");
      await sealMedia(id);
      const after = await getMedia(id);
      expect(after.group).toBe(group);
      expect(after.access).toBe("public");
      expect(after.file).toMatch(/^https:\/\//);
      const publicRead = await fetch(after.file);
      expect(publicRead.status).toBe(200);
    } finally {
      if (id) await deleteMedia(id);
    }
  }, 30000);
  it("reports private ticket uploads as private with a distinct signed group", async () => {
    const group = `frontlit-ticket:test:${crypto.randomUUID()}`;
    let id: string | undefined;
    try {
      id = await directUpload(group, "private", false);
      const actual = await getMedia(id);
      expect(actual.group).toBe(group);
      expect(actual.access).toBe("private");
    } finally {
      if (id) await deleteMedia(id);
    }
  }, 30000);
});
