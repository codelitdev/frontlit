import { and, count, desc, eq } from "drizzle-orm";
import { getActiveRelease } from "../pages/releases";
import { db } from "../db/client";
import {
  documents,
  media,
  pages,
  teamSettings,
  documentationRevisions,
} from "../db/schema";
import { deleteMedia as deleteFromMediaLit, sealMedia } from "./service";

export class MediaError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 422,
  ) {
    super(message);
  }
}

export function isUnsplashUrl(url?: string | null): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname === "unsplash.com" || parsed.hostname.endsWith(".unsplash.com")
    );
  } catch {
    return url.includes("unsplash.com");
  }
}

/** Seals the freshly-uploaded MediaLit object (temp → permanent) and adds
 * it to the team's library. File metadata comes from MediaLit, not the client. */
export async function registerMedia(input: {
  teamId: string;
  mediaLitId: string;
  alt?: string | null;
  caption?: string | null;
}) {
  if (!input.mediaLitId)
    throw new MediaError("INVALID_MEDIA", "Invalid media reference.");
  const existing = await db.query.media.findFirst({
    where: eq(media.mediaLitId, input.mediaLitId),
  });
  if (existing && existing.teamId !== input.teamId)
    throw new MediaError("INVALID_MEDIA", "Invalid media reference.");
  const meta = {
    ...(input.alt !== undefined ? { alt: input.alt } : {}),
    ...(input.caption !== undefined ? { caption: input.caption } : {}),
  };
  if (existing) {
    const [row] = await db
      .update(media)
      .set({ ...meta, updatedAt: new Date() })
      .where(eq(media.id, existing.id))
      .returning();
    return row;
  }
  let file: Awaited<ReturnType<typeof sealMedia>>;
  try {
    file = await sealMedia(input.mediaLitId);
  } catch {
    throw new MediaError(
      "MEDIA_PROVIDER_UNAVAILABLE",
      "Could not save the upload. Retry registration.",
      503,
    );
  }
  const [row] = await db
    .insert(media)
    .values({
      teamId: input.teamId,
      mediaLitId: input.mediaLitId,
      url: file.file,
      thumbnailUrl: file.thumbnail ?? null,
      fileName: file.originalFileName,
      mimeType: file.mimeType,
      size: file.size,
      ...meta,
    })
    .returning();
  return row;
}

export async function listMedia(input: {
  teamId: string;
  offset?: number;
  itemsPerPage?: number;
}) {
  const offset = ((input.offset ?? 1) - 1) * (input.itemsPerPage ?? 24);
  const limit = input.itemsPerPage ?? 24;

  return db.query.media.findMany({
    where: eq(media.teamId, input.teamId),
    limit,
    offset,
    orderBy: desc(media.createdAt),
  });
}

function placeContainsMedia(
  place: unknown,
  item: { mediaId: string; url: string },
): boolean {
  if (place == null) return false;
  if (typeof place === "string") return place === item.mediaId || place === item.url;
  if (Array.isArray(place))
    return place.some((value) => placeContainsMedia(value, item));
  if (typeof place === "object")
    return Object.values(place).some((value) => placeContainsMedia(value, item));
  return false;
}

/** How many saved FrontLit surfaces (branding, pages, documents) mention
 * each library item. Draft and live (active release) copies count
 * separately. */
export async function countMediaReferences(teamId: string) {
  const items = await db.query.media.findMany({
    where: eq(media.teamId, teamId),
    columns: { mediaId: true, url: true },
  });
  const counts: Record<string, number> = Object.fromEntries(
    items.map((item) => [item.mediaId, 0]),
  );
  if (items.length === 0) return counts;

  const [settings, teamPages, teamDocuments, retainedRevisions, release] =
    await Promise.all([
      db.query.teamSettings.findFirst({
        where: eq(teamSettings.teamId, teamId),
      }),
      db.query.pages.findMany({ where: eq(pages.teamId, teamId) }),
      db.query.documents.findMany({ where: eq(documents.teamId, teamId) }),
      db.query.documentationRevisions.findMany({
        where: eq(documentationRevisions.teamId, teamId),
      }),
      getActiveRelease(teamId),
    ]);

  const places: unknown[] = [
    ...retainedRevisions.map((revision) => revision.snapshot),
    settings?.logo,
    settings?.draftSharedWidgets,
    ...teamPages.flatMap((page) => [page.draftLayout, page.draftSocialImage]),
    release?.site,
    ...(release?.pages ?? []).map((entry) => entry.revision.content),
    ...teamDocuments.flatMap((document) => [
      document.content,
      document.draftContent,
      document.featuredImage,
      document.draftFeaturedImage,
    ]),
  ];

  for (const place of places) {
    for (const item of items) {
      if (placeContainsMedia(place, item)) {
        counts[item.mediaId] += 1;
      }
    }
  }

  return counts;
}

export async function countMedia(input: { teamId: string }) {
  const [{ value }] = await db
    .select({ value: count() })
    .from(media)
    .where(eq(media.teamId, input.teamId));
  return value;
}

export async function getMediaByMediaId(teamId: string, mediaId: string) {
  return db.query.media.findFirst({
    where: and(eq(media.teamId, teamId), eq(media.mediaId, mediaId)),
  });
}

export async function updateMedia(
  teamId: string,
  mediaId: string,
  patch: Partial<{ alt: string; caption: string }>,
) {
  const existing = await getMediaByMediaId(teamId, mediaId);
  if (!existing) return null;

  const [row] = await db
    .update(media)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(media.id, existing.id))
    .returning();
  return row;
}

export async function deleteMediaRecord(teamId: string, mediaId: string) {
  const existing = await getMediaByMediaId(teamId, mediaId);
  if (!existing) return { ok: false as const, reason: "not_found" as const };
  const counts = await countMediaReferences(teamId);
  if (counts[mediaId])
    throw new MediaError(
      "MEDIA_IN_USE",
      "Remove this asset from saved content before deleting it.",
      409,
    );
  await deleteFromMediaLit(existing.mediaLitId);
  await db.delete(media).where(eq(media.id, existing.id));
  return { ok: true as const };
}

/** Remove externally stored MediaLit objects before the owning team row
 * cascades away. Database cascades clean up metadata, but cannot clean up
 * object storage on their own. */
export async function deleteTeamMediaFiles(teamId: string): Promise<void> {
  const rows = await db
    .select({ mediaLitId: media.mediaLitId })
    .from(media)
    .where(eq(media.teamId, teamId));

  for (const row of rows) {
    await deleteFromMediaLit(row.mediaLitId);
  }
}
