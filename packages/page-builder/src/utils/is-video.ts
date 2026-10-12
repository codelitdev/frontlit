import type { Media } from "../models";

export function isVideo(youtubeLink?: string, media?: Partial<Media>) {
  return Boolean(
    youtubeLink || (media && RegExp("video/").test(media?.mimeType || "")),
  );
}
