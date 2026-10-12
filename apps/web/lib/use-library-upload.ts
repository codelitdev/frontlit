"use client";

import { registerMedia, type Media } from "@/lib/api";
import { useMediaLit } from "@/lib/use-medialit";

/**
 * Single FrontLit upload path: TUS to MediaLit, then register the sealed
 * file in the team's media library. Every UI picker should go through this
 * so /media always has the row.
 */
export function useLibraryUpload() {
  const { uploadFile, isUploading, uploadProgress, cancelUpload } = useMediaLit({
    signatureEndpoint: "/api/proxy/media/presigned",
    access: "public",
  });

  async function uploadToLibrary(
    file: File,
    meta: { alt?: string; caption?: string } = {},
  ): Promise<Media> {
    const uploaded = await uploadFile(file, {
      caption: meta.caption ?? "",
    });
    const mediaLitId =
      typeof uploaded.mediaId === "string"
        ? uploaded.mediaId
        : typeof uploaded.id === "string"
          ? uploaded.id
          : "";
    if (!mediaLitId) {
      throw new Error("Upload completed without a media id.");
    }
    return registerMedia({
      mediaLitId,
      intentId: uploaded.intentId,
      alt: meta.alt,
      caption: meta.caption,
    });
  }

  return { uploadToLibrary, isUploading, uploadProgress, cancelUpload };
}
