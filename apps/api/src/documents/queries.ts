import {
  readDocumentation,
  publishSingleDocument,
} from "../documentation/publications";
import {
  saveDocumentation,
  changeDocumentation,
  draftReport,
  getDocsSettings,
} from "../documentation/authoring";
import { DocsContentError } from "@frontlit/text-editor/docs";
import { and, count, eq, ilike, isNotNull, ne } from "drizzle-orm";
import { db } from "../db/client";
import { documents, type DocumentKind, type TextEditorContentRow } from "../db/schema";
import {
  isUniqueConstraintViolation,
  normalizeEditableSlug,
  slugify,
  SlugConflictError,
  uniqueSlug,
} from "../utils/slug";
import { enqueueDocumentIndex } from "../documentation/index-jobs";
import { isDocIndexable } from "../documentation/index-status";
import { teamIndexesKind } from "../documentation/index-policy";
import { deleteChunksForDocument } from "../documentation/queries";

import { isUnsplashUrl, registerMedia } from "../media/queries";
import { logger } from "../services/log";
import { invalidateSiteCache, siteTags } from "../services/site-cache";

export type DocumentStatus = "draft" | "published" | "published_with_changes";

const EMPTY_CONTENT: TextEditorContentRow = { type: "doc", content: [] };

export function normalizeFeaturedImage(input: unknown): Record<string, unknown> | null {
  if (!input) return null;
  if (typeof input === "string") {
    const trimmed = input.trim();
    return trimmed.length > 0 ? { url: trimmed } : null;
  }
  if (typeof input === "object" && input !== null) {
    const obj = input as Record<string, unknown>;
    const url =
      typeof obj.url === "string"
        ? obj.url.trim()
        : typeof obj.file === "string"
          ? obj.file.trim()
          : typeof obj.src === "string"
            ? obj.src.trim()
            : undefined;

    const thumbnailUrl =
      typeof obj.thumbnailUrl === "string"
        ? obj.thumbnailUrl.trim()
        : typeof obj.thumbnail === "string"
          ? obj.thumbnail.trim()
          : typeof obj.thumbUrl === "string"
            ? obj.thumbUrl.trim()
            : undefined;

    const rawMediaLitId =
      typeof obj.mediaLitId === "string"
        ? obj.mediaLitId.trim()
        : typeof obj.mediaId === "string"
          ? obj.mediaId.trim()
          : undefined;

    const mediaLitId =
      rawMediaLitId &&
      !rawMediaLitId.startsWith("http://") &&
      !rawMediaLitId.startsWith("https://") &&
      !isUnsplashUrl(rawMediaLitId)
        ? rawMediaLitId
        : undefined;

    const fileName =
      typeof obj.fileName === "string"
        ? obj.fileName.trim()
        : typeof obj.originalFileName === "string"
          ? obj.originalFileName.trim()
          : undefined;

    const alt =
      typeof obj.alt === "string"
        ? obj.alt
        : typeof obj.caption === "string"
          ? obj.caption
          : undefined;

    const caption = typeof obj.caption === "string" ? obj.caption : undefined;
    const mimeType = typeof obj.mimeType === "string" ? obj.mimeType : undefined;
    const size = typeof obj.size === "number" ? obj.size : undefined;

    if (!url && !mediaLitId) return null;

    return {
      ...obj,
      ...(url ? { url } : {}),
      ...(thumbnailUrl ? { thumbnailUrl } : {}),
      ...(mediaLitId ? { mediaLitId } : {}),
      ...(fileName ? { fileName } : {}),
      ...(mimeType ? { mimeType } : {}),
      ...(size !== undefined ? { size } : {}),
      ...(alt ? { alt } : {}),
      ...(caption ? { caption } : {}),
    };
  }
  return null;
}

export async function syncFeaturedImageToMediaLibrary(
  teamId: string,
  imageInput: unknown,
): Promise<void> {
  const normalized = normalizeFeaturedImage(imageInput);
  if (!normalized) return;

  const url = typeof normalized.url === "string" ? normalized.url : undefined;
  if (isUnsplashUrl(url)) {
    // Files selected via Unsplash tab should never become part of the user's media library.
    return;
  }

  const mediaLitId =
    typeof normalized.mediaLitId === "string"
      ? normalized.mediaLitId
      : typeof normalized.mediaId === "string"
        ? (normalized.mediaId as string)
        : undefined;

  // Media library is exclusive to uploads performed on the team and are backed by MediaLit integration.
  if (!mediaLitId) return;

  try {
    await registerMedia({
      teamId,
      mediaLitId,
      alt: typeof normalized.alt === "string" ? normalized.alt : undefined,
      caption: typeof normalized.caption === "string" ? normalized.caption : undefined,
    });
  } catch (err) {
    logger.warn(
      { error: (err as Error).message, teamId },
      "Failed to sync featured image to media library",
    );
  }
}

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
  draftGitSource?: { sourcePath: string; base: { sourcePath: string } | null } | null;
}): DocumentStatus {
  if (!doc.publishedAt) return "draft";

  const hasChanges =
    doc.title !== doc.draftTitle ||
    JSON.stringify(doc.content ?? null) !== JSON.stringify(doc.draftContent ?? null) ||
    doc.excerpt !== doc.draftExcerpt ||
    JSON.stringify(doc.featuredImage ?? null) !==
      JSON.stringify(doc.draftFeaturedImage ?? null) ||
    JSON.stringify(doc.meta ?? {}) !== JSON.stringify(doc.draftMeta ?? {}) ||
    ((doc as any).draftSlug != null && (doc as any).draftSlug !== (doc as any).slug) ||
    (!!doc.draftGitSource?.base &&
      doc.draftGitSource.sourcePath !== doc.draftGitSource.base.sourcePath);

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
  input: {
    teamId: string;
    title: string;
    slug?: string;
    content?: TextEditorContentRow;
    markdown?: string;
    gitSourcePath?: string;
    authorAccountId?: string;
    featuredImage?: unknown;
    meta?: Record<string, unknown>;
  },
) {
  if (kind === "doc") {
    const { teamId, authorAccountId, ...body } = input;
    return (await saveDocumentation(teamId, null, body, authorAccountId))!;
  }
  const slug = await uniqueSlug(slugify(input.title), (candidate) =>
    slugTaken(input.teamId, kind, candidate),
  );

  const normalizedFeaturedImage = normalizeFeaturedImage(input.featuredImage);

  const [doc] = await db
    .insert(documents)
    .values({
      teamId: input.teamId,
      authorAccountId: input.authorAccountId,
      kind,
      slug,
      draftTitle: input.title,
      draftContent: EMPTY_CONTENT,
      draftFeaturedImage: normalizedFeaturedImage,
      draftMeta: input.meta ?? {},
    })
    .returning();

  if (normalizedFeaturedImage) {
    await syncFeaturedImageToMediaLibrary(input.teamId, normalizedFeaturedImage);
  }

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
  const conditions = [eq(documents.teamId, input.teamId), eq(documents.kind, kind)];
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
  const conditions = [eq(documents.teamId, input.teamId), eq(documents.kind, kind)];
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
  teamId?: string,
) {
  const row = await db.query.documents.findFirst({
    where: and(
      eq(documents.documentId, documentId),
      eq(documents.kind, kind),
      ...(teamId ? [eq(documents.teamId, teamId)] : []),
    ),
  });
  if (row && kind === "doc") {
    let report;
    try {
      report = await draftReport(
        row.teamId,
        { ...row, draftSlug: row.draftSlug ?? row.slug },
        { documentId },
      );
    } catch (error) {
      if (!(error instanceof DocsContentError)) throw error;
      report = {
        saved: false,
        publishable: false,
        diagnostics: error.diagnostics,
        validatedAgainstPublicationId: null,
      };
    }
    return { ...row, ...report, source: (await getDocsSettings(row.teamId)).source };
  }
  return row;
}

/** Writes documentation slugs to draft state; other document kinds retain immediate slug edits.
 * Published content remains untouched until `publishDocument` promotes it
 * (architecture.md \u00a73). `meta` is shallow-merged into the existing draft
 * meta so callers can patch one field (e.g. `tags`) without resending all
 * of it. */
/** Refreshes the public blog or changelog feed. Docs go live through
 * publications, which notify the site themselves. */
function invalidateFeed(kind: DocumentKind, teamId: string) {
  return invalidateSiteCache(teamId, (publicTeamId) => [
    kind === "blog" ? siteTags.blog(publicTeamId) : siteTags.changelog(publicTeamId),
    siteTags.sitemap(publicTeamId),
  ]);
}

export async function updateDocument(
  kind: DocumentKind,
  teamId: string,
  documentId: string,
  patch: Partial<{
    expectedDraftVersion: number;
    markdown: string;
    title: string;
    slug: string;
    gitSourcePath: string;
    content: TextEditorContentRow;
    excerpt: string;
    featuredImage: unknown;
    meta: Record<string, unknown>;
  }>,
) {
  if (kind === "doc") return saveDocumentation(teamId, documentId, patch);
  const existing = await getDocumentByDocumentId(kind, documentId);
  if (!existing || existing.teamId !== teamId) return null;

  const { title, slug: requestedSlug, content, excerpt, featuredImage, meta } = patch;
  const normalizedContent = content;
  const slug =
    requestedSlug === undefined ? undefined : normalizeEditableSlug(requestedSlug);
  if (slug !== undefined && (await slugTaken(teamId, kind, slug, existing.id))) {
    throw new SlugConflictError("That slug is already in use.");
  }

  const nextDraftMeta =
    meta !== undefined
      ? {
          ...(existing.draftMeta as Record<string, unknown>),
          ...meta,
        }
      : undefined;
  const indexableToggled =
    meta !== undefined &&
    "indexable" in meta &&
    Boolean(existing.publishedAt) &&
    (await teamIndexesKind(teamId, kind));

  const normalizedFeaturedImage =
    featuredImage !== undefined ? normalizeFeaturedImage(featuredImage) : undefined;

  try {
    const [doc] = await db
      .update(documents)
      .set({
        ...(title !== undefined ? { draftTitle: title } : {}),
        ...(slug !== undefined ? { slug } : {}),
        ...(normalizedContent !== undefined ? { draftContent: normalizedContent } : {}),
        ...(excerpt !== undefined ? { draftExcerpt: excerpt } : {}),
        ...(featuredImage !== undefined
          ? { draftFeaturedImage: normalizedFeaturedImage }
          : {}),
        ...(nextDraftMeta !== undefined ? { draftMeta: nextDraftMeta } : {}),
        ...(indexableToggled
          ? {
              meta: {
                ...(existing.meta as Record<string, unknown>),
                indexable: meta!.indexable,
              },
            }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(documents.id, existing.id))
      .returning();

    if (normalizedFeaturedImage) {
      await syncFeaturedImageToMediaLibrary(teamId, normalizedFeaturedImage);
    }

    if (doc && indexableToggled) {
      if (isDocIndexable(doc.meta)) {
        await enqueueDocumentIndex(teamId, doc.id);
      } else {
        await deleteChunksForDocument(doc.id);
      }
    }
    // A slug change moves the public URL immediately.
    if (doc?.publishedAt && slug !== undefined && slug !== existing.slug)
      await invalidateFeed(kind, teamId);
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
 * enqueues a chunk/embed job when that content kind is enabled for
 * indexing (architecture.md §6.3). Only published content is searchable. */
export async function publishDocument(
  kind: DocumentKind,
  teamId: string,
  documentId: string,
  expectedDraftVersion?: number,
  context?: { expectedDocsDraftVersion: number; expectedPublicationId: string | null },
) {
  if (kind === "doc") {
    const doc = await publishSingleDocument(
      teamId,
      documentId,
      expectedDraftVersion,
      context,
    );
    return doc;
  }
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
  if (doc?.featuredImage)
    await syncFeaturedImageToMediaLibrary(teamId, doc.featuredImage);
  if (doc && (await teamIndexesKind(teamId, kind))) {
    if (isDocIndexable(doc.meta)) await enqueueDocumentIndex(teamId, doc.id);
    else await deleteChunksForDocument(doc.id);
  }
  if (doc) await invalidateFeed(kind, teamId);
  return doc;
}

/** Restore a published revision to a new documentation draft version. */
export async function discardDocumentDraft(
  kind: DocumentKind,
  teamId: string,
  documentId: string,
  expectedDraftVersion?: number,
) {
  if (kind === "doc")
    return changeDocumentation(teamId, documentId, expectedDraftVersion, "discard");
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
      draftMeta: existing.meta,
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
  expectedDraftVersion?: number,
) {
  if (kind === "doc") {
    const row = await changeDocumentation(
      teamId,
      documentId,
      expectedDraftVersion,
      "delete",
    );
    return row
      ? { ok: true as const }
      : { ok: false as const, reason: "not_found" as const };
  }
  const existing = await getDocumentByDocumentId(kind, documentId);
  if (!existing || existing.teamId !== teamId)
    return { ok: false as const, reason: "not_found" as const };
  await db.delete(documents).where(eq(documents.id, existing.id));
  if (existing.publishedAt) await invalidateFeed(kind, teamId);
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
  if (kind === "doc") {
    const live = await readDocumentation(input.teamId);
    const start = ((input.offset ?? 1) - 1) * (input.itemsPerPage ?? 20);
    return live.items.slice(start, start + (input.itemsPerPage ?? 20)) as any[];
  }
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
  if (kind === "doc") {
    return (await readDocumentation(input.teamId)).items.length;
  }
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
  if (kind === "doc") {
    return (await readDocumentation(teamId)).items.find((x) => x.slug === slug) as any;
  }
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
    where: and(eq(documents.teamId, teamId), eq(documents.kind, "changelog")),
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
    featuredImage?: unknown;
    meta?: Record<string, unknown>;
  },
) {
  if (kind === "doc") {
    const { teamId, ...body } = input;
    return (await saveDocumentation(teamId, null, body))!;
  }
  const slug = await uniqueSlug(slugify(input.title), (candidate) =>
    slugTaken(input.teamId, kind, candidate),
  );

  const normalizedFeaturedImage = normalizeFeaturedImage(input.featuredImage);

  const [doc] = await db
    .insert(documents)
    .values({
      teamId: input.teamId,
      kind,
      slug,
      draftTitle: input.title,
      draftContent: input.content,
      draftFeaturedImage: normalizedFeaturedImage,
      draftMeta: input.meta ?? {},
    })
    .returning();

  if (normalizedFeaturedImage) {
    await syncFeaturedImageToMediaLibrary(input.teamId, normalizedFeaturedImage);
  }

  return doc;
}
