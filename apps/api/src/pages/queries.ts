import { and, count, eq, ilike, isNotNull } from "drizzle-orm";
import { db } from "../db/client";
import { pages, type WidgetInstanceRow } from "../db/schema";
import { slugify, uniqueSlugForTeam } from "./slug";

type PageType = "site" | "blog" | "landing" | "post" | "custom";

/** Draft/publish status derived from the row, never stored (architecture.md §3). */
export type PageStatus = "draft" | "published" | "published_with_changes";

export function derivePageStatus(page: {
    publishedAt: Date | string | null;
    layout: unknown;
    draftLayout: unknown;
    title: string | null;
    draftTitle: string | null;
    description: string | null;
    draftDescription: string | null;
    socialImage: unknown;
    draftSocialImage: unknown;
    robotsAllowed: boolean | null;
    draftRobotsAllowed: boolean | null;
}): PageStatus {
    if (!page.publishedAt) return "draft";

    const hasChanges =
        JSON.stringify(page.layout) !== JSON.stringify(page.draftLayout) ||
        page.title !== page.draftTitle ||
        page.description !== page.draftDescription ||
        JSON.stringify(page.socialImage ?? null) !== JSON.stringify(page.draftSocialImage ?? null) ||
        (page.robotsAllowed ?? null) !== (page.draftRobotsAllowed ?? null);

    return hasChanges ? "published_with_changes" : "published";
}

export async function createPage(input: { teamId: string; name: string; type: PageType; themeId?: string }) {
    const slug = await uniqueSlugForTeam(input.teamId, slugify(input.name));
    const [page] = await db
        .insert(pages)
        .values({
            teamId: input.teamId,
            name: input.name,
            type: input.type,
            themeId: input.themeId,
            slug,
            layout: [],
            draftLayout: [],
        })
        .returning();
    return page;
}

export async function listPages(input: { teamId: string; type?: PageType; q?: string; offset?: number; itemsPerPage?: number }) {
    const conditions = [eq(pages.teamId, input.teamId)];
    if (input.type) conditions.push(eq(pages.type, input.type));
    if (input.q) conditions.push(ilike(pages.name, `%${input.q}%`));

    const offset = ((input.offset ?? 1) - 1) * (input.itemsPerPage ?? 20);
    const limit = input.itemsPerPage ?? 20;

    return db.query.pages.findMany({
        where: and(...conditions),
        limit,
        offset,
        orderBy: (row, { desc }) => desc(row.updatedAt),
    });
}

export async function countPages(input: { teamId: string; type?: PageType; q?: string }) {
    const conditions = [eq(pages.teamId, input.teamId)];
    if (input.type) conditions.push(eq(pages.type, input.type));
    if (input.q) conditions.push(ilike(pages.name, `%${input.q}%`));

    const [{ value }] = await db.select({ value: count() }).from(pages).where(and(...conditions));
    return value;
}

export async function getPageByPageId(pageId: string) {
    return db.query.pages.findFirst({ where: eq(pages.pageId, pageId) });
}

/** Writes only the draft columns — used by builder autosave and SEO edits.
 * Published fields are untouched until `publishPage` promotes them. */
export async function updatePage(
    teamId: string,
    pageId: string,
    patch: Partial<{
        name: string;
        layout: WidgetInstanceRow[];
        themeId: string | null;
        title: string;
        description: string;
        socialImage: Record<string, unknown>;
        robotsAllowed: boolean;
    }>,
) {
    const existing = await getPageByPageId(pageId);
    if (!existing || existing.teamId !== teamId) return null;

    const { name, layout, title, description, socialImage, robotsAllowed, themeId } = patch;

    const [page] = await db
        .update(pages)
        .set({
            ...(name !== undefined ? { name } : {}),
            ...(layout !== undefined ? { draftLayout: layout } : {}),
            ...(title !== undefined ? { draftTitle: title } : {}),
            ...(description !== undefined ? { draftDescription: description } : {}),
            ...(socialImage !== undefined ? { draftSocialImage: socialImage } : {}),
            ...(robotsAllowed !== undefined ? { draftRobotsAllowed: robotsAllowed } : {}),
            ...(themeId !== undefined ? { themeId } : {}),
            updatedAt: new Date(),
        })
        .where(eq(pages.id, existing.id))
        .returning();
    return page;
}

/** Promotes the draft state to published: copies draft_* -> published
 * columns in one update and stamps `publishedAt` (architecture.md §3). */
export async function publishPage(teamId: string, pageId: string) {
    const existing = await getPageByPageId(pageId);
    if (!existing || existing.teamId !== teamId) return null;

    const [page] = await db
        .update(pages)
        .set({
            layout: existing.draftLayout,
            title: existing.draftTitle,
            description: existing.draftDescription,
            socialImage: existing.draftSocialImage,
            robotsAllowed: existing.draftRobotsAllowed,
            publishedAt: new Date(),
            updatedAt: new Date(),
        })
        .where(eq(pages.id, existing.id))
        .returning();
    return page;
}

/** Reverts the draft state back to whatever is currently published. */
export async function discardPageDraft(teamId: string, pageId: string) {
    const existing = await getPageByPageId(pageId);
    if (!existing || existing.teamId !== teamId) return null;

    const [page] = await db
        .update(pages)
        .set({
            draftLayout: existing.layout,
            draftTitle: existing.title,
            draftDescription: existing.description,
            draftSocialImage: existing.socialImage,
            draftRobotsAllowed: existing.robotsAllowed,
            updatedAt: new Date(),
        })
        .where(eq(pages.id, existing.id))
        .returning();
    return page;
}

/** Unauthenticated, published-only reads for public site rendering
 * (architecture.md §5.4/§12.2). Never selects draft* columns. */
export async function getPublishedPageBySlug(teamId: string, slug: string) {
    const page = await db.query.pages.findFirst({ where: and(eq(pages.teamId, teamId), eq(pages.slug, slug)) });
    if (!page || !page.publishedAt) return null;
    return page;
}

/** Every published page for a team, for the sitemap (architecture.md
 * §12.3) — callers filter out `robotsAllowed === false` themselves since
 * `null` means "allowed" (the default), not "disallowed". */
export async function listPublishedPages(teamId: string) {
    return db.query.pages.findMany({
        where: and(eq(pages.teamId, teamId), isNotNull(pages.publishedAt)),
    });
}

export async function deletePage(teamId: string, pageId: string) {
    const existing = await getPageByPageId(pageId);
    if (!existing || existing.teamId !== teamId) return { ok: false as const, reason: "not_found" as const };
    if (!existing.deleteable) return { ok: false as const, reason: "not_deleteable" as const };
    await db.delete(pages).where(eq(pages.id, existing.id));
    return { ok: true as const };
}
