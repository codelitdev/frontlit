import { createHash } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  parsePageFile,
  serializePageFile,
  type PageDocument,
} from "@frontlit/page-builder/schema";
import { db } from "../db/client";
import {
  pageRevisions,
  pages,
  siteReleasePages,
  siteReleases,
  teamSettings,
  type PageRevisionContent,
  type SharedWidgetsRow,
  type SiteReleaseSnapshot,
  type SiteReleaseSource,
  type WidgetInstanceRow,
} from "../db/schema";
import { getTeamSettings } from "../settings/queries";
import { createRequiredPageLayout, hydrateSharedWidgets } from "./shared-widgets";

type Executor = Pick<typeof db, "select" | "insert" | "update" | "delete" | "query">;

/** Canonical page file text and its sha256. The hash identifies a revision:
 * equal content from the builder or a repo maps to the same row. */
export function pageRevisionFile(doc: PageDocument): { text: string; hash: string } {
  const { published: _published, ...content } = doc;
  const text = serializePageFile({ ...content, layout: content.layout });
  return { text, hash: createHash("sha256").update(text).digest("hex") };
}

/** A page's draft columns as a `PageDocument`. */
export function draftDocument(page: {
  draftTitle: string | null;
  draftDescription: string | null;
  draftSocialImage: Record<string, unknown> | null;
  draftRobotsAllowed: boolean | null;
  draftLayout: WidgetInstanceRow[];
}): PageDocument {
  return {
    title: page.draftTitle ?? undefined,
    description: page.draftDescription ?? undefined,
    socialImage: page.draftSocialImage ?? undefined,
    robotsAllowed: page.draftRobotsAllowed ?? undefined,
    layout: page.draftLayout,
  };
}

/** Finds or creates the revision for `doc`. */
export async function ensureRevision(
  executor: Executor,
  teamId: string,
  doc: PageDocument,
): Promise<{ id: string; hash: string; content: PageRevisionContent }> {
  const { text, hash } = pageRevisionFile(doc);
  const { published: _published, ...content } = parsePageFile(text);
  await executor
    .insert(pageRevisions)
    .values({ teamId, hash, content: content as PageRevisionContent })
    .onConflictDoNothing();
  const [revision] = await executor
    .select()
    .from(pageRevisions)
    .where(and(eq(pageRevisions.teamId, teamId), eq(pageRevisions.hash, hash)));
  return revision;
}

/** A revision as a stored draft layout: positional widget ids and the
 * required header/footer placeholders (chrome settings live on the team). */
export function revisionDraftLayout(
  content: PageRevisionContent,
  slug: string,
): WidgetInstanceRow[] {
  const body = content.layout.map((block, index) => ({
    widgetId: `${slug || "home"}-${index + 1}`,
    name: block.name,
    deletable: block.name !== "data-slot",
    moveable: true,
    shared: false,
    settings: block.settings ?? {},
  }));
  return createRequiredPageLayout("", body);
}

/** Render-ready layout for a published revision, with the release's chrome. */
export function revisionLayout(
  content: PageRevisionContent,
  slug: string,
  site: SiteReleaseSnapshot,
): WidgetInstanceRow[] {
  return hydrateSharedWidgets(
    revisionDraftLayout(content, slug),
    chromeWidgets(site),
    slug,
  );
}

export function chromeWidgets(site: SiteReleaseSnapshot): SharedWidgetsRow {
  const widget = (name: "header" | "footer", settings: Record<string, unknown>) => ({
    widgetId: `shared-${name}`,
    name,
    deletable: false,
    moveable: false,
    shared: true,
    settings,
  });
  return {
    header: widget("header", site.header),
    footer: widget("footer", site.footer),
  };
}

export interface ReleasePage {
  pageId: string | null;
  slug: string;
  name: string;
  revisionId: string;
}

export interface LoadedRelease {
  id: string;
  releaseId: string;
  teamId: string;
  source: SiteReleaseSource;
  commitSha: string | null;
  docsPublicationId: string | null;
  site: SiteReleaseSnapshot;
  summary: string | null;
  createdAt: Date;
  pages: (ReleasePage & {
    revision: {
      id: string;
      hash: string;
      content: PageRevisionContent;
      createdAt: Date;
    };
  })[];
}

async function loadRelease(
  executor: Executor,
  where: ReturnType<typeof eq>,
): Promise<LoadedRelease | null> {
  const [release] = await executor.select().from(siteReleases).where(where);
  if (!release) return null;
  const rows = await executor
    .select({ entry: siteReleasePages, revision: pageRevisions })
    .from(siteReleasePages)
    .innerJoin(pageRevisions, eq(pageRevisions.id, siteReleasePages.revisionId))
    .where(eq(siteReleasePages.releaseId, release.id));
  return {
    ...release,
    pages: rows.map(({ entry, revision }) => ({
      pageId: entry.pageId,
      slug: entry.slug,
      name: entry.name,
      revisionId: entry.revisionId,
      revision: {
        id: revision.id,
        hash: revision.hash,
        content: revision.content,
        createdAt: revision.createdAt,
      },
    })),
  };
}

export async function getActiveRelease(
  teamId: string,
  executor: Executor = db,
): Promise<LoadedRelease | null> {
  const [settings] = await executor
    .select({ activeReleaseId: teamSettings.activeReleaseId })
    .from(teamSettings)
    .where(eq(teamSettings.teamId, teamId));
  if (!settings?.activeReleaseId) return null;
  return loadRelease(executor, eq(siteReleases.id, settings.activeReleaseId));
}

export async function getReleaseByReleaseId(teamId: string, releaseId: string) {
  const release = await loadRelease(db, eq(siteReleases.releaseId, releaseId));
  return release?.teamId === teamId ? release : null;
}

export async function listReleases(teamId: string, limit = 50) {
  const [settings, rows] = await Promise.all([
    getTeamSettings(teamId),
    db
      .select()
      .from(siteReleases)
      .where(eq(siteReleases.teamId, teamId))
      .orderBy(desc(siteReleases.createdAt))
      .limit(limit),
  ]);
  const counts = rows.length
    ? await db
        .select({ releaseId: siteReleasePages.releaseId })
        .from(siteReleasePages)
        .where(
          inArray(
            siteReleasePages.releaseId,
            rows.map((row) => row.id),
          ),
        )
    : [];
  return rows.map((row) => ({
    releaseId: row.releaseId,
    source: row.source,
    commitSha: row.commitSha,
    summary: row.summary,
    pageCount: counts.filter((count) => count.releaseId === row.id).length,
    active: row.id === settings.activeReleaseId,
    createdAt: row.createdAt,
  }));
}

/** Makes `release` live. Docs aren't switched: a Git release goes live
 * together with its commit's docs publication (see `activateGitRelease`),
 * and rolling back restores pages, header and footer only. */
export async function activateRelease(
  executor: Executor,
  release: { id: string; teamId: string },
) {
  await executor
    .update(teamSettings)
    .set({ activeReleaseId: release.id, updatedAt: new Date() })
    .where(eq(teamSettings.teamId, release.teamId));
}

/** Inserts an immutable release. Does not activate it. */
export async function insertRelease(
  executor: Executor,
  input: {
    teamId: string;
    source: SiteReleaseSource;
    site: SiteReleaseSnapshot;
    pages: ReleasePage[];
    summary?: string;
    commitSha?: string | null;
    sourceKey?: string | null;
    docsPublicationId?: string | null;
  },
) {
  const [release] = await executor
    .insert(siteReleases)
    .values({
      teamId: input.teamId,
      source: input.source,
      site: input.site,
      summary: input.summary ?? null,
      commitSha: input.commitSha ?? null,
      sourceKey: input.sourceKey ?? null,
      docsPublicationId: input.docsPublicationId ?? null,
    })
    .returning();
  if (input.pages.length) {
    await executor
      .insert(siteReleasePages)
      .values(input.pages.map((page) => ({ ...page, releaseId: release.id })));
  }
  return release;
}

/**
 * Publishes a builder change as a new active release: the active release's
 * pages with `change` applied. `publishChrome` also publishes the team's
 * draft header/footer (a page publish does; a delete or move doesn't).
 * Theme and redirects carry over from the active release.
 */
export async function publishBuilderRelease(
  teamId: string,
  options: { summary: string; publishChrome: boolean },
  change: (pages: ReleasePage[], executor: Executor) => Promise<ReleasePage[]>,
) {
  // Read (and lazily create) settings before the transaction: it runs on
  // the shared connection, which would wait on the open transaction.
  const settings = await getTeamSettings(teamId);
  return db.transaction(async (tx) => {
    const active = await getActiveRelease(teamId, tx);
    const current: ReleasePage[] = (active?.pages ?? []).map(
      ({ pageId, slug, name, revisionId }) => ({ pageId, slug, name, revisionId }),
    );
    const draftChrome = {
      header: settings.draftSharedWidgets.header.settings ?? {},
      footer: settings.draftSharedWidgets.footer.settings ?? {},
    };
    const site: SiteReleaseSnapshot =
      active && !options.publishChrome
        ? active.site
        : { ...active?.site, ...draftChrome };
    const release = await insertRelease(tx, {
      teamId,
      source: "builder",
      site,
      pages: await change(current, tx),
      summary: options.summary,
    });
    await activateRelease(tx, release);
    return release;
  });
}

/** Release entry for a builder page, publishing its current draft. */
export async function draftReleasePage(
  executor: Executor,
  page: typeof pages.$inferSelect,
): Promise<ReleasePage> {
  const revision = await ensureRevision(executor, page.teamId, draftDocument(page));
  return { pageId: page.id, slug: page.slug, name: page.name, revisionId: revision.id };
}
