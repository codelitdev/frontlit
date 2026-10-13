import { lockSettings } from "../documentation/authoring";
import { withDbTransaction } from "../db/transaction";
import { registerVerifiedMedia, MediaProvenanceError } from "./provenance";
import { and, count, desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import {
  documents,
  media,
  pages,
  teamSettings,
  documentationRevisions,
  documentationDeliveryOutbox,
} from "../db/schema";
import { deleteMedia as deleteFromMediaLit } from "./service";

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

/** Seals the freshly-uploaded MediaLit object or stores provisioned
 * MediaLit media and inserts the team's library row — registration is the commit point.
 * The media library is exclusive to uploads performed on the team and backed by MediaLit integration. */
export async function registerMedia(input: {
  teamId: string;
  mediaLitId: string;
  intentId?: string;
  url?: string;
  thumbnailUrl?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
  size?: number | null;
  alt?: string | null;
  caption?: string | null;
}) {
  return registerVerifiedMedia(input);
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
 * each library item. Draft and published copies count separately. */
export async function countMediaReferences(teamId: string) {
  const items = await db.query.media.findMany({
    where: eq(media.teamId, teamId),
    columns: { mediaId: true, url: true },
  });
  const counts: Record<string, number> = Object.fromEntries(
    items.map((item) => [item.mediaId, 0]),
  );
  if (items.length === 0) return counts;

  const [settings, teamPages, teamDocuments, retainedRevisions] = await Promise.all([
    db.query.teamSettings.findFirst({
      where: eq(teamSettings.teamId, teamId),
    }),
    db.query.pages.findMany({ where: eq(pages.teamId, teamId) }),
    db.query.documents.findMany({ where: eq(documents.teamId, teamId) }),
    db.query.documentationRevisions.findMany({
      where: eq(documentationRevisions.teamId, teamId),
    }),
  ]);

  const places: unknown[] = [
    ...retainedRevisions.map((revision) => revision.snapshot),
    settings?.logo,
    settings?.sharedWidgets,
    settings?.draftSharedWidgets,
    ...teamPages.flatMap((page) => [
      page.layout,
      page.draftLayout,
      page.socialImage,
      page.draftSocialImage,
    ]),
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

async function getMediaByMediaLitId(teamId: string, mediaLitId: string) {
  return db.query.media.findFirst({
    where: and(eq(media.teamId, teamId), eq(media.mediaLitId, mediaLitId)),
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

  return withDbTransaction(async (tx) => {
    const settings = await lockSettings(tx, teamId);
    const counts = await countMediaReferences(teamId);
    if (counts[mediaId])
      throw new MediaProvenanceError(
        "MEDIA_IN_USE",
        "Remove this asset from saved content before deleting it.",
        409,
      );
    // Commit deleting state and durable work before provider I/O. New docs
    // references reject this state under the same authoring/publication lock.
    await tx
      .update(media)
      .set({ access: "deleting", updatedAt: new Date() })
      .where(eq(media.id, existing.id));
    await tx.insert(documentationDeliveryOutbox).values({
      teamId,
      publicationId: settings.activePublicationId,
      policyEpoch: settings.policyEpoch,
      type: "media_delete",
      payload: { mediaId: existing.mediaId, mediaLitId: existing.mediaLitId },
    });
    return { ok: true as const };
  });
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
