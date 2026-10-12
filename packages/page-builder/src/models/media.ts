export interface Media {
  [key: string]: unknown;
  mediaId?: string;
  originalFileName?: string;
  fileName?: string;
  mimeType?: string;
  size?: number;
  caption?: string;
  alt?: string;
  /** Public URL of the asset (MediaLit format or generic URL format). */
  file?: string;
  url?: string;
  src?: string;
  /** Thumbnail URL, falls back to `file` or `url` when absent. */
  thumbnail?: string;
  thumbnailUrl?: string;
}

export function getMediaUrl(media: unknown): string | null {
  if (!media) return null;
  if (typeof media === "string") return media.trim() || null;
  if (typeof media === "object") {
    const obj = media as Record<string, unknown>;
    const url = obj.url ?? obj.file ?? obj.src;
    return typeof url === "string" && url.trim() ? url.trim() : null;
  }
  return null;
}

export function getMediaAlt(media: unknown): string {
  if (!media || typeof media !== "object") return "";
  const obj = media as Record<string, unknown>;
  const alt = obj.alt ?? obj.caption ?? obj.title;
  return typeof alt === "string" ? alt : "";
}
