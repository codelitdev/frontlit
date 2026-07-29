import { and, count, eq, ilike, isNotNull, ne } from "drizzle-orm";
import { db } from "../db/client";
import {
    documents,
    type DocumentKind,
    type TextEditorContentRow,
} from "../db/schema";
import {
    isUniqueConstraintViolation,
    normalizeEditableSlug,
    slugify,
    SlugConflictError,
    uniqueSlug,
} from "../utils/slug";
import { reindexDocument } from "../documentation/queries";

export type DocumentStatus = "draft" | "published" | "published_with_changes";

const EMPTY_CONTENT: TextEditorContentRow = { type: "doc", content: [] };

export function deriveDocumentStatus(doc: {
    publishedAt: Date | string | null;
    title: string | null;
    draftTitle: string;
    content: unknown;
    draftContent: unknown;
    excerpt: string | null;
    draftExcerpt: string | null;
    featuredImage: unknown;
    draftFeaturedImage: unknown;
    meta: unknown;
    draftMeta: unknown;
}): DocumentStatus {
    if (!doc.publishedAt) return "draft";

    const hasChanges =
        doc.title !== doc.draftTitle ||
        JSON.stringify(doc.content ?? null) !==
            JSON.stringify(doc.draftContent ?? null) ||
        doc.excerpt !== doc.draftExcerpt ||
        JSON.stringify(doc.featuredImage ?? null) !==
            JSON.stringify(doc.draftFeaturedImage ?? null) ||
        JSON.stringify(doc.meta ?? {}) !== JSON.stringify(doc.draftMeta ?? {});

    return hasChanges ? "published_with_changes" : "published";
}

async function slugTaken(
    teamId: string,
    kind: DocumentKind,
    slug: string,
    excludeDocumentId?: string,
): Promise<boolean> {
    const conditions = [
        eq(documents.teamId, teamId),
        eq(documents.kind, kind),
        eq(documents.slug, slug),
    ];
    if (excludeDocumentId) conditions.push(ne(documents.id, excludeDocumentId));
    const existing = await db.query.documents.findFirst({
        where: and(...conditions),
    });
    return Boolean(existing);
}

export async function createDocument(
    kind: DocumentKind,
    input: { teamId: string; title: string; meta?: Record<string, unknown> },
) {
    const slug = await uniqueSlug(slugify(input.title), (candidate) =>
        slugTaken(input.teamId, kind, candidate),
    );

    const [doc] = await db
        .insert(documents)
        .values({
            teamId: input.teamId,
            kind,
            slug,
            draftTitle: input.title,
            draftContent: EMPTY_CONTENT,
            draftMeta: input.meta ?? {},
        })
        .returning();
    return doc;
}

export async function listDocuments(
    kind: DocumentKind,
    input: {
        teamId: string;
        q?: string;
        offset?: number;
        itemsPerPage?: number;
    },
) {
    const conditions = [
        eq(documents.teamId, input.teamId),
        eq(documents.kind, kind),
    ];
    if (input.q) conditions.push(ilike(documents.draftTitle, `%${input.q}%`));

    const offset = ((input.offset ?? 1) - 1) * (input.itemsPerPage ?? 20);
    const limit = input.itemsPerPage ?? 20;

    return db.query.documents.findMany({
        where: and(...conditions),
        limit,
        offset,
        orderBy: (row, { desc }) => desc(row.updatedAt),
    });
}

export async function countDocuments(
    kind: DocumentKind,
    input: { teamId: string; q?: string },
) {
    const conditions = [
        eq(documents.teamId, input.teamId),
        eq(documents.kind, kind),
    ];
    if (input.q) conditions.push(ilike(documents.draftTitle, `%${input.q}%`));

    const [{ value }] = await db
        .select({ value: count() })
        .from(documents)
        .where(and(...conditions));
    return value;
}

export async function getDocumentByDocumentId(
    kind: DocumentKind,
    documentId: string,
) {
    return db.query.documents.findFirst({
        where: and(
            eq(documents.documentId, documentId),
            eq(documents.kind, kind),
        ),
    });
}

/** Writes content to draft columns while applying `slug` immediately.
 * Published content remains untouched until `publishDocument` promotes it
 * (architecture.md \u00a73). `meta` is shallow-merged into the existing draft
 * meta so callers can patch one field (e.g. `tags`) without resending all
 * of it. */
export async function updateDocument(
    kind: DocumentKind,
    teamId: string,
    documentId: string,
    patch: Partial<{
        title: string;
        slug: string;
        content: TextEditorContentRow;
        excerpt: string;
        featuredImage: Record<string, unknown>;
        meta: Record<string, unknown>;
    }>,
) {
    const existing = await getDocumentByDocumentId(kind, documentId);
    if (!existing || existing.teamId !== teamId) return null;

    const {
        title,
        slug: requestedSlug,
        content,
        excerpt,
        featuredImage,
        meta,
    } = patch;
    const slug =
        requestedSlug === undefined
            ? undefined
            : normalizeEditableSlug(requestedSlug);
    if (
        slug !== undefined &&
        (await slugTaken(teamId, kind, slug, existing.id))
    ) {
        throw new SlugConflictError("That slug is already in use.");
    }

    try {
        const [doc] = await db
            .update(documents)
            .set({
                ...(title !== undefined ? { draftTitle: title } : {}),
                ...(slug !== undefined ? { slug } : {}),
                ...(content !== undefined ? { draftContent: content } : {}),
                ...(excerpt !== undefined ? { draftExcerpt: excerpt } : {}),
                ...(featuredImage !== undefined
                    ? { draftFeaturedImage: featuredImage }
                    : {}),
                ...(meta !== undefined
                    ? {
                          draftMeta: {
                              ...(existing.draftMeta as Record<
                                  string,
                                  unknown
                              >),
                              ...meta,
                          },
                      }
                    : {}),
                updatedAt: new Date(),
            })
            .where(eq(documents.id, existing.id))
            .returning();
        return doc;
    } catch (error) {
        if (slug !== undefined && isUniqueConstraintViolation(error)) {
            throw new SlugConflictError("That slug is already in use.");
        }
        throw error;
    }
}

/** Promotes the draft state to published: copies draft_* -> published
 * columns in one update and stamps `publishedAt`. For the `doc` kind, this
 * also re-indexes the document's pgvector chunks (architecture.md §6.3) —
 * only published content is ever searchable/citable, never draft. */
export async function publishDocument(
    kind: DocumentKind,
    teamId: string,
    documentId: string,
) {
    const existing = await getDocumentByDocumentId(kind, documentId);
    if (!existing || existing.teamId !== teamId) return null;

    const [doc] = await db
        .update(documents)
        .set({
            title: existing.draftTitle,
            content: existing.draftContent,
            excerpt: existing.draftExcerpt,
            featuredImage: existing.draftFeaturedImage,
            meta: existing.draftMeta,
            publishedAt: new Date(),
            updatedAt: new Date(),
        })
        .where(eq(documents.id, existing.id))
        .returning();

    if (doc && kind === "doc") {
        await reindexDocument({
            teamId,
            documentId: doc.id,
            content: doc.content,
        });
    }

    return doc;
}

/** Reverts the draft state back to whatever is currently published. A
 * document that has never been published has nothing to revert to, so
 * this is a no-op in that case (draft* columns are NOT NULL \u2014 unlike
 * pages, there's no "empty" draft state to fall back to). */
export async function discardDocumentDraft(
    kind: DocumentKind,
    teamId: string,
    documentId: string,
) {
    const existing = await getDocumentByDocumentId(kind, documentId);
    if (!existing || existing.teamId !== teamId) return null;
    if (!existing.publishedAt) return existing;

    const [doc] = await db
        .update(documents)
        .set({
            draftTitle: existing.title as string,
            draftContent: existing.content as TextEditorContentRow,
            draftExcerpt: existing.excerpt,
            draftFeaturedImage: existing.featuredImage,
            draftMeta: existing.meta as Record<string, unknown>,
            updatedAt: new Date(),
        })
        .where(eq(documents.id, existing.id))
        .returning();
    return doc;
}

export async function deleteDocument(
    kind: DocumentKind,
    teamId: string,
    documentId: string,
) {
    const existing = await getDocumentByDocumentId(kind, documentId);
    if (!existing || existing.teamId !== teamId)
        return { ok: false as const, reason: "not_found" as const };
    await db.delete(documents).where(eq(documents.id, existing.id));
    return { ok: true as const };
}

// ---------------------------------------------------------------------------
// Public reads (architecture.md §5.4): published-only, no session/API key.
// Never touch draft* columns.
// ---------------------------------------------------------------------------

export async function listPublishedDocuments(
    kind: DocumentKind,
    input: { teamId: string; offset?: number; itemsPerPage?: number },
) {
    const offset = ((input.offset ?? 1) - 1) * (input.itemsPerPage ?? 20);
    const limit = input.itemsPerPage ?? 20;

    return db.query.documents.findMany({
        where: and(
            eq(documents.teamId, input.teamId),
            eq(documents.kind, kind),
            isNotNull(documents.publishedAt),
        ),
        limit,
        offset,
        orderBy: (row, { desc }) => desc(row.publishedAt),
    });
}

export async function countPublishedDocuments(
    kind: DocumentKind,
    input: { teamId: string },
) {
    const [{ value }] = await db
        .select({ value: count() })
        .from(documents)
        .where(
            and(
                eq(documents.teamId, input.teamId),
                eq(documents.kind, kind),
                isNotNull(documents.publishedAt),
            ),
        );
    return value;
}

export async function getPublishedDocumentBySlug(
    kind: DocumentKind,
    teamId: string,
    slug: string,
) {
    return db.query.documents.findFirst({
        where: and(
            eq(documents.teamId, teamId),
            eq(documents.kind, kind),
            eq(documents.slug, slug),
            isNotNull(documents.publishedAt),
        ),
    });
}

/** Import idempotency key for GitHub-sourced changelog entries
 * (architecture.md §8.1): one draft document per GitHub release id, never
 * duplicated on repeat imports. */
export async function findChangelogByGithubReleaseId(
    teamId: string,
    releaseId: number,
) {
    const all = await db.query.documents.findMany({
        where: and(
            eq(documents.teamId, teamId),
            eq(documents.kind, "changelog"),
        ),
    });
    return all.find(
        (doc) =>
            (doc.draftMeta as any)?.github?.releaseId === releaseId ||
            (doc.meta as any)?.github?.releaseId === releaseId,
    );
}

export async function createDocumentWithContent(
    kind: DocumentKind,
    input: {
        teamId: string;
        title: string;
        content: TextEditorContentRow;
        meta?: Record<string, unknown>;
    },
) {
    const slug = await uniqueSlug(slugify(input.title), (candidate) =>
        slugTaken(input.teamId, kind, candidate),
    );

    const [doc] = await db
        .insert(documents)
        .values({
            teamId: input.teamId,
            kind,
            slug,
            draftTitle: input.title,
            draftContent: input.content,
            draftMeta: input.meta ?? {},
        })
        .returning();
    return doc;
}
