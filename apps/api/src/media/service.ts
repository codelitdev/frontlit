/**
 * Thin wrapper around the `medialit` SDK — FrontLit's only integration point
 * with MediaLit. Mirrors the service surface already proven in
 * `courselit/apps/web/services/medialit.ts` and `sendlit/apps/api/src/media/service.ts`:
 * `getSignature` (browser upload, direct-to-MediaLit), `seal` (promote a temp
 * upload to permanent storage), `get`, `delete`. FrontLit servers never
 * receive file bytes — see architecture.md §9.
 */
async function getMediaLitClient() {
  const { MediaLit } = await import("medialit");
  return new MediaLit({
    apiKey: process.env.MEDIALIT_APIKEY,
    endpoint: process.env.MEDIALIT_SERVER,
  });
}

export interface MediaLitMedia {
  mediaId: string;
  originalFileName: string;
  mimeType: string;
  size: number;
  access: "public" | "private";
  file: string;
  thumbnail?: string;
  caption?: string;
  group?: string;
}

/** Public library callers use a unique server-owned intent group. Group
 * metadata is accepted as provenance only after the capability probe passes. */
export async function getMediaUploadSignature(
  group: string,
): Promise<{ signature: string; endpoint: string }> {
  const medialit = await getMediaLitClient();
  const signature = await medialit.getSignature({ group });
  return { signature, endpoint: medialit.endpoint };
}

export class MediaLitHttpError extends Error {
  constructor(public status: number) {
    super(`MediaLit request failed (${status}).`);
  }
}
async function mediaLitRequest(path: string, method: string) {
  const medialit = await getMediaLitClient();
  // Preserve HTTP status: the SDK turns both not-found and outages into plain
  // Error, which cannot support authoritative reconciliation/idempotent delete.
  const response = await fetch(`${medialit.endpoint}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-medialit-apikey":
        process.env.MEDIALIT_APIKEY || process.env.MEDIALIT_API_KEY || "",
    },
    signal: AbortSignal.timeout(10000),
  });
  return response;
}
export async function getMedia(mediaId: string): Promise<MediaLitMedia> {
  const response = await mediaLitRequest(
    `/media/get/${encodeURIComponent(mediaId)}`,
    "POST",
  );
  if (!response.ok) throw new MediaLitHttpError(response.status);
  const result = (await response.json()) as any;
  return {
    ...result,
    access: (result.access ?? result.accessControl)?.toLowerCase(),
    file: result.file ?? "",
  } as MediaLitMedia;
}

/** Promotes a freshly-uploaded (temp/private) file to permanent storage.
 * Uploads are temp until sealed; FrontLit seals on library registration
 * (`POST /media`), matching courselit's flow of sealing when content is
 * actually committed rather than on every upload attempt. */
export async function sealMedia(mediaId: string): Promise<MediaLitMedia> {
  const medialit = await getMediaLitClient();
  const result = await medialit.seal(mediaId);
  return {
    ...result,
    access: (
      (result as unknown as { access?: string }).access ?? result.accessControl
    )?.toLowerCase(),
    file: result.file ?? "",
  } as unknown as MediaLitMedia;
}

export async function deleteMedia(mediaId: string): Promise<void> {
  const response = await mediaLitRequest(
    `/media/delete/${encodeURIComponent(mediaId)}`,
    "DELETE",
  );
  if (!response.ok && response.status !== 404)
    throw new MediaLitHttpError(response.status);
}

let groupBindingProbe: { expiresAt: number; result: Promise<boolean> } | undefined;
/** Treat a provider group as provenance only after proving that client upload
 * metadata cannot override the signed group. Positive results expire too, so a
 * provider downgrade cannot silently turn grouping labels into ownership proof. */
export async function mediaLitBindsSignedGroups(): Promise<boolean> {
  if (groupBindingProbe && groupBindingProbe.expiresAt > Date.now())
    return groupBindingProbe.result;
  const result = (async () => {
    let mediaId: string | undefined;
    try {
      const group = `frontlit-provenance-probe:${crypto.randomUUID()}`;
      const { signature, endpoint } = await getMediaUploadSignature(group);
      const bytes = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXioAAAAASUVORK5CYII=",
        "base64",
      );
      const metadata = Object.entries({
        fileName: "frontlit-provenance-probe.png",
        mimeType: "image/png",
        access: "public",
        group: "unsigned-client-group",
      })
        .map(([key, value]) => `${key} ${Buffer.from(value).toString("base64")}`)
        .join(",");
      const created = await fetch(`${endpoint}/media/create/resumable`, {
        method: "POST",
        headers: {
          "Tus-Resumable": "1.0.0",
          "Upload-Length": String(bytes.length),
          "Upload-Metadata": metadata,
          "x-medialit-signature": signature,
        },
        signal: AbortSignal.timeout(10000),
      });
      if (created.status !== 201) return false;
      const location = new URL(created.headers.get("location")!, endpoint);
      // Follow only the configured provider's TUS location; no client URL is fetched.
      if (location.origin !== new URL(endpoint).origin) return false;
      const uploaded = await fetch(location, {
        method: "PATCH",
        headers: {
          "Tus-Resumable": "1.0.0",
          "Upload-Offset": "0",
          "Content-Type": "application/offset+octet-stream",
          "x-medialit-signature": signature,
        },
        body: bytes,
        signal: AbortSignal.timeout(10000),
      });
      if (uploaded.status !== 204) return false;
      mediaId = JSON.parse(uploaded.headers.get("Media") ?? "null")?.mediaId;
      if (!mediaId) return false;
      const actual = await getMedia(mediaId);
      return actual.group === group;
    } catch {
      return false;
    } finally {
      if (mediaId) await deleteMedia(mediaId).catch(() => {});
    }
  })();
  groupBindingProbe = { expiresAt: Date.now() + 5 * 60_000, result };
  return result;
}
