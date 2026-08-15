import { and, count, desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { documents, media, pages, teamSettings } from "../db/schema";
import {
    deleteMedia as deleteFromMediaLit,
    sealMedia,
    type MediaLitMedia,
} from "./service";

/** Seals the freshly-uploaded MediaLit object and inserts the team's
 * library row from the sealed (authoritative) response \u2014 registration is
 * the commit point: an upload the user never registers stays temp on
 * MediaLit's side and is reaped there, never touching FrontLit's DB. */
export async function registerMedia(input: {
    teamId: string;
    mediaLitId: string;
    alt?: string;
    caption?: string;
}) {
    const sealed: MediaLitMedia = await sealMedia(input.mediaLitId);

    const [row] = await db
        .insert(media)
        .values({
            teamId: input.teamId,
            mediaLitId: sealed.mediaId,
            url: sealed.file,
            thumbnailUrl: sealed.thumbnail || null,
            fileName: sealed.originalFileName,
            mimeType: sealed.mimeType,
            size: sealed.size,
            alt: input.alt,
            caption: input.caption ?? sealed.caption,
        })
        .onConflictDoNothing({ target: [media.teamId, media.mediaLitId] })
        .returning();

    // Re-registering the same MediaLit id for a team (e.g. a retried
    // request) is idempotent: return the existing row instead of erroring.
    if (row) return row;
    return getMediaByMediaLitId(input.teamId, sealed.mediaId);
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
    const text = JSON.stringify(place);
    return text.includes(item.mediaId) || text.includes(item.url);
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

    const [settings, teamPages, teamDocuments] = await Promise.all([
        db.query.teamSettings.findFirst({
            where: eq(teamSettings.teamId, teamId),
        }),
        db.query.pages.findMany({ where: eq(pages.teamId, teamId) }),
        db.query.documents.findMany({ where: eq(documents.teamId, teamId) }),
    ]);

    const places: unknown[] = [
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
