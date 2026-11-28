import { featuredImageInputSchema, type FeaturedImage } from "@frontlit/api-contract";
import { DocsContentError, diagnostic } from "@frontlit/text-editor/docs";
import { getMediaByMediaId } from "../media/queries";

/**
 * Turns a caller's featured image (a `med_…` id, an image URL, or
 * `{ mediaId?, url?, thumbnailUrl?, alt? }`) into the stored shape.
 * A `mediaId` must name an item in the team's media library; its url and
 * thumbnail come from that item. Invalid input throws a DocsContentError.
 */
export async function resolveFeaturedImage(
  teamId: string,
  input: unknown,
): Promise<FeaturedImage | null> {
  if (input === null || input === undefined || input === "") return null;
  const parsed = featuredImageInputSchema.safeParse(input);
  if (!parsed.success)
    throw new DocsContentError(
      parsed.error.issues.map((issue) =>
        diagnostic("INVALID_FEATURED_IMAGE", issue.message, {
          fieldPath: ["featuredImage", ...issue.path].join("."),
        }),
      ),
    );
  const value =
    typeof parsed.data === "string"
      ? parsed.data.startsWith("med_")
        ? { mediaId: parsed.data }
        : { url: parsed.data }
      : parsed.data;

  if (!value.mediaId) {
    return {
      url: value.url!,
      ...("thumbnailUrl" in value && value.thumbnailUrl
        ? { thumbnailUrl: value.thumbnailUrl }
        : {}),
      ...("alt" in value && value.alt ? { alt: value.alt } : {}),
    };
  }

  const item = await getMediaByMediaId(teamId, value.mediaId);
  if (!item)
    throw new DocsContentError([
      diagnostic(
        "MEDIA_NOT_FOUND",
        `No media "${value.mediaId}" in this team's media library. Register the upload with register_media and pass the returned mediaId.`,
        { fieldPath: "featuredImage.mediaId" },
      ),
    ]);
  const alt = ("alt" in value && value.alt) || item.alt || undefined;
  return {
    mediaId: item.mediaId,
    url: item.url,
    ...(item.thumbnailUrl ? { thumbnailUrl: item.thumbnailUrl } : {}),
    ...(alt ? { alt } : {}),
  };
}

/** Reduces a stored featured image to the served shape. Documentation
 * revision snapshots are immutable and may still carry pre-schema keys
 * (`mediaLitId`, `file`, `caption`); those never reach readers. */
export function servedFeaturedImage(stored: unknown): FeaturedImage | null {
  if (!stored || typeof stored !== "object") return null;
  const obj = stored as Record<string, unknown>;
  if (typeof obj.url !== "string" || !obj.url) return null;
  return {
    ...(typeof obj.mediaId === "string" && obj.mediaId.startsWith("med_")
      ? { mediaId: obj.mediaId }
      : {}),
    url: obj.url,
    ...(typeof obj.thumbnailUrl === "string" ? { thumbnailUrl: obj.thumbnailUrl } : {}),
    ...(typeof obj.alt === "string" && obj.alt ? { alt: obj.alt } : {}),
  };
}
