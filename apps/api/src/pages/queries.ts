import { and, count, eq, ilike } from "drizzle-orm";
import { isReservedPageSlug } from "@frontlit/api-contract";
import { db } from "../db/client";
import {
  pages,
  type SharedWidgetsRow,
  teamSettings,
  type WidgetInstanceRow,
} from "../db/schema";
import { getTeamSettings } from "../settings/queries";
import { isSlugTakenForTeam, slugify, uniqueSlugForTeam } from "./slug";
import {
  InvalidSlugError,
  isUniqueConstraintViolation,
  normalizeEditableSlug,
  SlugConflictError,
} from "../utils/slug";
import {
  canonicalPageLayout,
  createRequiredSharedWidgetPlaceholders,
  hydrateSharedWidgets,
  repairStoredLayout,
  splitSubmittedLayout,
} from "./shared-widgets";
import {
  parsePageFile,
  SchemaValidationError,
  serializePageFile,
  type PageDocument,
} from "@frontlit/page-builder/schema";
import { applyTextEdits, type TextEdit } from "@frontlit/text-editor/blocks";
import { normalizeSocialImage } from "./social-image";
import { getPagesGitBinding, pageGitInfo, PageOwnedByGitError } from "./git-pr";
import {
  assertDraftVersion,
  nextDraftVersion,
  StaleDraftError,
} from "../utils/draft-version";
import {
  draftDocument,
  draftReleasePage,
  getActiveRelease,
  pageRevisionFile,
  publishBuilderRelease,
  revisionDraftLayout,
  revisionLayout,
  type LoadedRelease,
} from "./releases";

/** Draft/publish status, derived from the page's draft and its entry in
 * the active release (architecture.md §3). */
export type PageStatus = "draft" | "published" | "published_with_changes";

type PageRow = typeof pages.$inferSelect;
type ReleaseEntry = LoadedRelease["pages"][number];

function releaseEntry(release: LoadedRelease | null, page: { id: string }) {
  return release?.pages.find((entry) => entry.pageId === page.id) ?? null;
}

export function derivePageStatus(
  page: PageRow,
  entry: ReleaseEntry | null,
): PageStatus {
  if (!entry) return "draft";
  try {
    return pageRevisionFile(draftDocument(page)).hash === entry.revision.hash
      ? "published"
      : "published_with_changes";
  } catch {
    // A draft saved before a schema change no longer validates; it can't
    // equal a release, and the page must still open so it can be fixed.
    return "published_with_changes";
  }
}

/** JSON with object keys sorted, so equal settings compare equal whatever
 * order they were saved in. */
function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );
}

/** The draft header/footer differ from the live ones. They are shared by
 * every page and go live with any page's publish, so this is reported
 * once for the site, not folded into each page's own status. */
function sharedWidgetsChanged(
  release: LoadedRelease | null,
  draft: SharedWidgetsRow,
): boolean {
  if (!release) return false;
  return (["header", "footer"] as const).some(
    (name) =>
      stableJson(draft[name].settings ?? {}) !== stableJson(release.site[name] ?? {}),
  );
}

async function getRawPageByPageId(pageId: string) {
  return db.query.pages.findFirst({ where: eq(pages.pageId, pageId) });
}

/** The admin view of a page: its draft (with draft chrome) plus whatever
 * the active release publishes for it. */
function toPageView(
  page: PageRow,
  release: LoadedRelease | null,
  draftSharedWidgets: SharedWidgetsRow,
) {
  const entry = releaseEntry(release, page);
  const content = entry?.revision.content;
  return {
    ...page,
    status: derivePageStatus(page, entry),
    sharedWidgetsHaveChanges: sharedWidgetsChanged(release, draftSharedWidgets),
    publishedAt: entry ? release!.createdAt : null,
    layout:
      entry && release
        ? revisionLayout(entry.revision.content, entry.slug, release.site)
        : [],
    title: content?.title ?? null,
    description: content?.description ?? null,
    socialImage: (content?.socialImage as Record<string, unknown> | undefined) ?? null,
    robotsAllowed: content ? content.robotsAllowed !== false : null,
    draftLayout: hydrateSharedWidgets(page.draftLayout, draftSharedWidgets, page.slug),
  };
}

export type PageView = ReturnType<typeof toPageView>;

/** Whether the team's draft header/footer differ from the live ones. */
export async function sharedWidgetsHaveChanges(teamId: string) {
  const [settings, release] = await Promise.all([
    getTeamSettings(teamId),
    getActiveRelease(teamId),
  ]);
  return sharedWidgetsChanged(release, settings.draftSharedWidgets);
}

async function viewPages(teamId: string, rows: PageRow[]) {
  const [settings, release] = await Promise.all([
    getTeamSettings(teamId),
    getActiveRelease(teamId),
  ]);
  return rows.map((row) => toPageView(row, release, settings.draftSharedWidgets));
}

export async function createPage(input: { teamId: string; name: string }) {
  const slug = await uniqueSlugForTeam(input.teamId, slugify(input.name));
  const [page] = await db
    .insert(pages)
    .values({
      teamId: input.teamId,
      name: input.name,
      slug,
      draftLayout: createRequiredSharedWidgetPlaceholders(),
    })
    .returning();
  const [view] = await viewPages(input.teamId, [page]);
  return view;
}

export async function listPages(input: {
  teamId: string;
  q?: string;
  offset?: number;
  itemsPerPage?: number;
}) {
  const conditions = [eq(pages.teamId, input.teamId)];
  if (input.q) conditions.push(ilike(pages.name, `%${input.q}%`));

  const offset = ((input.offset ?? 1) - 1) * (input.itemsPerPage ?? 20);
  const limit = input.itemsPerPage ?? 20;

  const items = await db.query.pages.findMany({
    where: and(...conditions),
    limit,
    offset,
    orderBy: (row, { desc }) => desc(row.updatedAt),
  });
  return viewPages(input.teamId, items);
}

export async function countPages(input: { teamId: string; q?: string }) {
  const conditions = [eq(pages.teamId, input.teamId)];
  if (input.q) conditions.push(ilike(pages.name, `%${input.q}%`));

  const [{ value }] = await db
    .select({ value: count() })
    .from(pages)
    .where(and(...conditions));
  return value;
}

export async function getPageByPageId(pageId: string) {
  const page = await getRawPageByPageId(pageId);
  if (!page) return undefined;
  const [view] = await viewPages(page.teamId, [page]);
  return { ...view, git: await pageGitInfo(page) };
}

/** Writes builder/SEO fields to draft columns. The slug is intentionally
 * immediate: renaming a published page publishes a release that moves it,
 * without publishing unrelated draft content. */
export async function updatePage(
  teamId: string,
  pageId: string,
  patch: Partial<{
    name: string;
    slug: string;
    layout: WidgetInstanceRow[];
    title: string;
    description: string;
    socialImage: string | Record<string, unknown> | null;
    robotsAllowed: boolean;
    expectedDraftVersion: number;
  }>,
) {
  const existing = await getRawPageByPageId(pageId);
  if (!existing || existing.teamId !== teamId) return null;
  const { expectedDraftVersion } = patch;
  // Checked before the slug move below, which commits on its own.
  assertDraftVersion(existing.draftVersion, expectedDraftVersion);

  const {
    name,
    slug: requestedSlug,
    layout,
    title,
    description,
    socialImage,
    robotsAllowed,
  } = patch;

  const normalizedSocialImage =
    socialImage !== undefined
      ? socialImage
        ? normalizeSocialImage(socialImage)
        : null
      : undefined;

  let slug: string | undefined;
  if (
    requestedSlug !== undefined &&
    requestedSlug !== existing.slug &&
    (await getPagesGitBinding(teamId))
  )
    throw new PageOwnedByGitError();
  if (requestedSlug !== undefined) {
    if (existing.slug === "" || !existing.deletable) {
      throw new InvalidSlugError(
        `The ${existing.name} URL is fixed at /${existing.slug}.`,
      );
    }
    slug = normalizeEditableSlug(requestedSlug);
    if (isReservedPageSlug(slug)) {
      throw new InvalidSlugError(`/${slug} is reserved by the site.`);
    }
    if (await isSlugTakenForTeam(teamId, slug, existing.id)) {
      throw new SlugConflictError("That slug is already in use.");
    }
  }
  const settings = layout !== undefined ? await getTeamSettings(teamId) : null;
  const splitLayout =
    layout !== undefined && settings
      ? splitSubmittedLayout(
          canonicalPageLayout(layout),
          settings.draftSharedWidgets,
          existing.slug,
        )
      : null;

  // A published page's new URL goes live with a release that moves it, in
  // the same transaction as the slug change.
  const moved =
    slug !== undefined &&
    slug !== existing.slug &&
    releaseEntry(await getActiveRelease(teamId), existing) !== null;
  try {
    if (moved) {
      const summary = `Moved ${existing.name} to /${slug}`;
      await publishBuilderRelease(
        teamId,
        { summary, publishChrome: false },
        async (entries, tx) => {
          await tx
            .update(pages)
            .set({ slug, updatedAt: new Date() })
            .where(eq(pages.id, existing.id));
          return entries.map((entry) =>
            entry.pageId === existing.id ? { ...entry, slug: slug! } : entry,
          );
        },
      );
    }
    await db.transaction(async (tx) => {
      if (splitLayout && settings) {
        await tx
          .update(teamSettings)
          .set({
            draftSharedWidgets: splitLayout.sharedWidgets,
            updatedAt: new Date(),
          })
          .where(eq(teamSettings.id, settings.id));
      }
      const changesDraft =
        splitLayout !== null ||
        title !== undefined ||
        description !== undefined ||
        normalizedSocialImage !== undefined ||
        robotsAllowed !== undefined;
      const [row] = await tx
        .update(pages)
        .set({
          ...(changesDraft
            ? { draftVersion: nextDraftVersion(pages.draftVersion) }
            : {}),
          ...(name !== undefined ? { name } : {}),
          ...(slug !== undefined && !moved ? { slug } : {}),
          ...(splitLayout ? { draftLayout: splitLayout.storedLayout } : {}),
          ...(title !== undefined ? { draftTitle: title } : {}),
          ...(description !== undefined ? { draftDescription: description } : {}),
          ...(normalizedSocialImage !== undefined
            ? { draftSocialImage: normalizedSocialImage }
            : {}),
          ...(robotsAllowed !== undefined ? { draftRobotsAllowed: robotsAllowed } : {}),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(pages.id, existing.id),
            // Only a draft change is compared here: a slug-only save already
            // passed the check above, and a slug move has committed by now.
            changesDraft && expectedDraftVersion !== undefined
              ? eq(pages.draftVersion, expectedDraftVersion)
              : undefined,
          ),
        )
        .returning({ draftVersion: pages.draftVersion });
      // Someone wrote the draft between the check above and this update.
      if (!row) {
        const current = await tx.query.pages.findFirst({
          where: eq(pages.id, existing.id),
        });
        throw new StaleDraftError(current?.draftVersion ?? existing.draftVersion);
      }
    });
  } catch (error) {
    if (slug !== undefined && isUniqueConstraintViolation(error)) {
      throw new SlugConflictError("That slug is already in use.");
    }
    throw error;
  }
  return getPageByPageId(pageId);
}

/** The stored draft no longer matches the block schemas (saved before a
 * schema change), so it has no page file to edit. */
export class InvalidStoredDraftError extends Error {
  constructor(readonly cause: SchemaValidationError) {
    super(cause.message);
    this.name = "InvalidStoredDraftError";
  }
}

/** The page's draft as its canonical page file: what `editPageDraft` edits. */
export function draftPageFile(page: Parameters<typeof draftDocument>[0]): string {
  return serializePageFile(draftDocument(page));
}

/**
 * Applies exact-match `edits` to the page's draft through its page file
 * (layout and SEO). Block bookkeeping is rebuilt as Git sync and rollback do:
 * positional widget ids and the required header/footer and data slot. The
 * shared header/footer are not part of the file and stay untouched. Saves
 * only if nobody wrote the draft since it was read (`StaleDraftError`).
 */
export async function editPageDraft(
  teamId: string,
  pageId: string,
  edits: readonly TextEdit[],
) {
  const existing = await getRawPageByPageId(pageId);
  if (!existing || existing.teamId !== teamId) return null;
  let file: string;
  try {
    file = draftPageFile(existing);
  } catch (error) {
    if (error instanceof SchemaValidationError)
      throw new InvalidStoredDraftError(error);
    throw error;
  }
  const edited: PageDocument = parsePageFile(applyTextEdits(file, edits));
  const [row] = await db
    .update(pages)
    .set({
      draftLayout: repairStoredLayout(
        revisionDraftLayout(edited as never, existing.slug),
        existing.slug,
      ),
      draftTitle: edited.title ?? null,
      draftDescription: edited.description ?? null,
      draftSocialImage: (edited.socialImage as Record<string, unknown>) ?? null,
      draftRobotsAllowed: edited.robotsAllowed ?? null,
      draftVersion: nextDraftVersion(pages.draftVersion),
      updatedAt: new Date(),
    })
    .where(
      and(eq(pages.id, existing.id), eq(pages.draftVersion, existing.draftVersion)),
    )
    .returning({ id: pages.id });
  if (!row) {
    const current = await getRawPageByPageId(pageId);
    throw new StaleDraftError(current?.draftVersion ?? existing.draftVersion);
  }
  return getPageByPageId(pageId);
}

/** Publishes the page's draft (and the draft header/footer) as a new
 * active site release. */
export async function publishPage(teamId: string, pageId: string) {
  const existing = await getRawPageByPageId(pageId);
  if (!existing || existing.teamId !== teamId) return null;
  if (await getPagesGitBinding(teamId)) throw new PageOwnedByGitError();

  const summary = `Published ${existing.name}`;
  await publishBuilderRelease(
    teamId,
    { summary, publishChrome: true },
    async (entries, tx) => {
      const next = await draftReleasePage(tx, existing);
      return [...entries.filter((entry) => entry.pageId !== existing.id), next];
    },
  );
  return getPageByPageId(pageId);
}

/** Resets the page's draft (and the draft header/footer) to what's live. */
export async function discardPageDraft(teamId: string, pageId: string) {
  const existing = await getRawPageByPageId(pageId);
  if (!existing || existing.teamId !== teamId) return null;
  const [settings, release] = await Promise.all([
    getTeamSettings(teamId),
    getActiveRelease(teamId),
  ]);
  const entry = releaseEntry(release, existing);
  if (!release) return getPageByPageId(pageId);

  await db.transaction(async (tx) => {
    await tx
      .update(teamSettings)
      .set({
        draftSharedWidgets: {
          header: {
            ...settings.draftSharedWidgets.header,
            settings: release.site.header,
          },
          footer: {
            ...settings.draftSharedWidgets.footer,
            settings: release.site.footer,
          },
        },
        updatedAt: new Date(),
      })
      .where(eq(teamSettings.id, settings.id));
    if (entry) {
      const content = entry.revision.content;
      await tx
        .update(pages)
        .set({
          draftLayout: revisionDraftLayout(content, existing.slug),
          draftTitle: content.title ?? null,
          draftDescription: content.description ?? null,
          draftSocialImage: (content.socialImage as Record<string, unknown>) ?? null,
          draftRobotsAllowed: content.robotsAllowed ?? null,
          draftVersion: nextDraftVersion(pages.draftVersion),
          updatedAt: new Date(),
        })
        .where(eq(pages.id, existing.id));
    }
  });
  return getPageByPageId(pageId);
}

/** Unauthenticated, published-only read for public rendering: the page at
 * `slug` in the team's active release. */
export async function getPublishedPageBySlug(
  teamId: string,
  slug: string,
  /** Render this release instead of the active one (signed previews). */
  releaseOverride?: LoadedRelease | null,
) {
  const release = releaseOverride ?? (await getActiveRelease(teamId));
  const entry = release?.pages.find((page) => page.slug === slug);
  if (!release || !entry) return null;
  const page = entry.pageId
    ? await db.query.pages.findFirst({ where: eq(pages.id, entry.pageId) })
    : undefined;
  const content = entry.revision.content;
  return {
    pageId: page?.pageId ?? "",
    name: entry.name,
    slug: entry.slug,
    layout: revisionLayout(content, entry.slug, release.site),
    title: content.title ?? null,
    description: content.description ?? null,
    socialImage: (content.socialImage as Record<string, unknown> | undefined) ?? null,
    robotsAllowed: content.robotsAllowed !== false,
    publishedAt: release.createdAt,
    updatedAt: release.createdAt,
  };
}

/** Every page in the active release, for the sitemap. */
export async function listPublishedPages(teamId: string) {
  const release = await getActiveRelease(teamId);
  return (release?.pages ?? []).map((entry) => ({
    slug: entry.slug,
    title: entry.revision.content.title || entry.name,
    robotsAllowed: entry.revision.content.robotsAllowed !== false,
    // A revision is created when its content first appears, so this only
    // moves when the page itself changes.
    publishedAt: entry.revision.createdAt,
    updatedAt: entry.revision.createdAt,
  }));
}

export async function deletePage(teamId: string, pageId: string) {
  const existing = await getRawPageByPageId(pageId);
  if (!existing || existing.teamId !== teamId)
    return { ok: false as const, reason: "not_found" as const };
  if (!existing.deletable)
    return { ok: false as const, reason: "not_deletable" as const };
  if (await getPagesGitBinding(teamId)) throw new PageOwnedByGitError();
  const active = await getActiveRelease(teamId);
  if (releaseEntry(active, existing)) {
    // Unpublish and delete together.
    const summary = `Deleted ${existing.name}`;
    await publishBuilderRelease(
      teamId,
      { summary, publishChrome: false },
      async (entries, tx) => {
        await tx.delete(pages).where(eq(pages.id, existing.id));
        return entries.filter((entry) => entry.pageId !== existing.id);
      },
    );
  } else {
    await db.delete(pages).where(eq(pages.id, existing.id));
  }
  return { ok: true as const };
}
