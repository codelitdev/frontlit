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

/** Uploads are grouped by team in MediaLit for organization only. */
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

/** Server-side upload of a file FrontLit already holds (repo images synced
 * from Git). Public and sealed, so the returned URL is permanent. */
export async function uploadMediaFile(input: {
  bytes: Uint8Array;
  fileName: string;
  mimeType: string;
  group: string;
}): Promise<MediaLitMedia> {
  const medialit = await getMediaLitClient();
  const form = new FormData();
  form.append(
    "file",
    new Blob([Buffer.from(input.bytes)], { type: input.mimeType }),
    input.fileName,
  );
  form.append("access", "public");
  form.append("group", input.group);
  const response = await fetch(`${medialit.endpoint}/media/create`, {
    method: "POST",
    headers: {
      "x-medialit-apikey":
        process.env.MEDIALIT_APIKEY || process.env.MEDIALIT_API_KEY || "",
    },
    body: form,
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new MediaLitHttpError(response.status);
  // Uploads stay temporary (and expire) until sealed.
  const created = (await response.json()) as { mediaId: string };
  return sealMedia(created.mediaId);
}
