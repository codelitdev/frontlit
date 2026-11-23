import { Upload } from "tus-js-client";

export interface UploadedMedia {
  mediaId: string;
  url: string;
  name: string;
  mimeType: string;
}

async function post<T>(path: string): Promise<T> {
  const response = await fetch(path, { method: "POST" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(body.error ?? `${path} failed (${response.status})`);
  return body as T;
}

/** Lets the author choose a file; resolves null when they cancel. */
export function chooseFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.addEventListener("change", () => resolve(input.files?.[0] ?? null));
    input.addEventListener("cancel", () => resolve(null));
    input.click();
  });
}

/**
 * Uploads a file the way a FrontLit host does: a signature from our server,
 * the bytes straight to MediaLit over tus, then our server seals the upload
 * so it does not expire.
 */
export async function uploadToMediaLit(
  file: File,
  onProgress: (percent: number) => void,
): Promise<UploadedMedia> {
  const { signature, endpoint } = await post<{ signature: string; endpoint: string }>(
    "/api/media/signature",
  );
  const mediaId = await new Promise<string>((resolve, reject) => {
    const upload = new Upload(file, {
      endpoint: `${endpoint}/media/create/resumable`,
      removeFingerprintOnSuccess: true,
      retryDelays: [0, 3000, 5000],
      headers: { "x-medialit-signature": signature },
      metadata: {
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        access: "public",
      },
      onProgress: (sent, total) => onProgress(Math.round((sent / total) * 100)),
      onError: reject,
      onSuccess: (payload) => {
        const media = JSON.parse(payload.lastResponse.getHeader("Media") ?? "null");
        if (media?.mediaId) resolve(media.mediaId);
        else reject(new Error("Upload finished without a media ID"));
      },
    });
    upload.start();
  });
  return post<UploadedMedia>(`/api/media/${encodeURIComponent(mediaId)}/seal`);
}
