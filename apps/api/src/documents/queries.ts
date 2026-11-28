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
import {
  DocsContentError,
  diagnostic,
  incompleteDocsBlocks,
  parseDocsMarkdown,
} from "@frontlit/text-editor/docs";
import { requireCompleteMarkdownBlocks } from "../documentation/content-validation";
import { and, count, desc, eq, ilike, isNotNull, ne, sql } from "drizzle-orm";
import { db } from "../db/client";
import { documents, type DocumentKind, type TextEditorContentRow } from "../db/schema";
import {
  isUniqueConstraintViolation,
  normalizeEditableSlug,
  slugify,
  SlugConflictError,
  uniqueSlug,
} from "../utils/slug";
import { teamIndexesKind } from "../documentation/index-policy";
import { requestSearchIndex } from "../search/requests";

import { resolveFeaturedImage } from "./featured-image";
import { invalidateSiteCache, siteTags } from "../services/site-cache";

export type DocumentStatus = "draft" | "published" | "published_with_changes";

const EMPTY_CONTENT: TextEditorContentRow = { type: "doc", content: [] };

/** Articles and product updates take a body as TipTap JSON or as Markdown.
 * Markdown goes through the documentation parser, whose output the article
 * editor and renderer support in full; failures are DocsContentErrors. */
function documentBody(input: {
  content?: TextEditorContentRow;
  markdown?: string;
}): TextEditorContentRow | undefined {
  if (input.markdown === undefined) return input.content;
  if (input.content !== undefined)
    throw new DocsContentError([
      diagnostic("INVALID_REQUEST", "Supply content or markdown, never both.", {
        fieldPath: "markdown",
      }),
    ]);
  const { content } = parseDocsMarkdown(input.markdown, { frontmatter: false });
  requireCompleteMarkdownBlocks(content);
  return content as TextEditorContentRow;
}

/**
 * Whether an article's or product update's draft can be published, and why
 * not: blocks the editor saved half-filled (a Button without its link)
 * render nothing, so they block publishing. Docs carry their own, fuller
 * report (`draftReport`).
 */
export function withPublishReport<T extends Record<string, unknown>>(row: T) {
  if (row.kind === "doc" || "publishable" in row) return row;
  const diagnostics = incompleteDocsBlocks(row.draftContent);
  return { ...row, publishable: diagnostics.length === 0, diagnostics };
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
    excerpt?: string | null;
    featuredImage?: unknown;
    meta?: Record<string, unknown>;
  },
) {
  if (kind === "doc") {
    const { teamId, authorAccountId, ...body } = input;
    return (await saveDocumentation(teamId, null, body, authorAccountId))!;
  }
  const content = documentBody(input) ?? EMPTY_CONTENT;
  const slug = await uniqueSlug(slugify(input.title), (candidate) =>
    slugTaken(input.teamId, kind, candidate),
  );

  const featuredImage = await resolveFeaturedImage(input.teamId, input.featuredImage);

  const [doc] = await db
    .insert(documents)
    .values({
      teamId: input.teamId,
      authorAccountId: input.authorAccountId,
      kind,
      slug,
      draftTitle: input.title,
      draftContent: content,
      draftExcerpt: input.excerpt ?? null,
      draftFeaturedImage: featuredImage,
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

  const { title, slug: requestedSlug, excerpt, featuredImage, meta } = patch;
  const normalizedContent = documentBody(patch);
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

  const resolvedFeaturedImage =
    featuredImage !== undefined
      ? await resolveFeaturedImage(teamId, featuredImage)
      : undefined;

  try {
    const [doc] = await db
      .update(documents)
      .set({
        ...(title !== undefined ? { draftTitle: title } : {}),
        ...(slug !== undefined ? { slug } : {}),
        ...(normalizedContent !== undefined ? { draftContent: normalizedContent } : {}),
        ...(excerpt !== undefined ? { draftExcerpt: excerpt } : {}),
        ...(featuredImage !== undefined
          ? { draftFeaturedImage: resolvedFeaturedImage }
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

    const slugMoved = slug !== undefined && slug !== existing.slug;
    if (doc?.publishedAt && (indexableToggled || slugMoved))
      await requestSearchIndex(teamId);
    // A slug change moves the public URL immediately.
    if (doc?.publishedAt && slugMoved) await invalidateFeed(kind, teamId);
    return doc;
  } catch (error) {
    if (slug !== undefined && isUniqueConstraintViolation(error)) {
      throw new SlugConflictError("That slug is already in use.");
    }
    throw error;
  }
}

/** Promotes the draft state to published: copies draft_* -> published
 * columns in one update and stamps `publishedAt`, then asks the search
 * index to pick up the change. Only published content is searchable. */
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
  const blockers = incompleteDocsBlocks(existing.draftContent);
  if (blockers.length) throw new DocsContentError(blockers);
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
  if (doc) await requestSearchIndex(teamId);
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
  if (existing.publishedAt) {
    await requestSearchIndex(teamId);
    await invalidateFeed(kind, teamId);
  }
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
    orderBy:
      kind === "changelog"
        ? [desc(changelogDateSql), desc(documents.publishedAt)]
        : [desc(documents.publishedAt)],
  });
}

/** SQL twin of `changelogDate()` from the API contract: the published release
 * date, else the publish date (stored as UTC wall time), as `YYYY-MM-DD`. Reads the
 * published `meta` only, never `draftMeta`. */
const changelogDateSql = sql`coalesce(${documents.meta}->>'releaseDate', to_char(${documents.publishedAt}, 'YYYY-MM-DD'))`;

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
