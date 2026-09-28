import type { FrontLitImage } from "./frontlit-image-uploader";

export interface FeaturedImageRef {
  [key: string]: unknown;
  mediaId?: string;
  url: string;
  thumbnailUrl?: string;
  alt?: string;
}

export function toFeaturedImageRef(image: {
  src: string;
  alt?: string;
  media?: FrontLitImage;
}): FeaturedImageRef {
  if (image.media) {
    return {
      mediaId: image.media.mediaId,
      url: image.media.url,
      thumbnailUrl: image.media.thumbnailUrl ?? undefined,
      alt: image.media.alt || image.alt || undefined,
    };
  }
  return {
    url: image.src,
    alt: image.alt || undefined,
  };
}

export function getFeaturedImageUrl(image: unknown): string | null {
  if (!image) return null;
  if (typeof image === "string") return image;
  if (typeof image === "object") {
    const obj = image as Record<string, unknown>;
    const url = obj.url ?? obj.file ?? obj.src;
    return typeof url === "string" ? url : null;
  }
  return null;
}

export function getFeaturedImageAlt(image: unknown): string {
  if (!image || typeof image !== "object") return "";
  const obj = image as Record<string, unknown>;
  const alt = obj.alt ?? obj.caption ?? obj.title;
  return typeof alt === "string" ? alt : "";
}
