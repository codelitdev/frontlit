import { and, count, eq, ilike, isNotNull } from "drizzle-orm";
import { db } from "../db/client";
import {
    pages,
    teamSettings,
    themes,
    type SharedWidgetsRow,
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
    createRequiredSharedWidgetPlaceholders,
    hydrateSharedWidgets,
    splitSubmittedLayout,
} from "./shared-widgets";

type PageType = "site" | "blog" | "landing" | "post" | "custom";

/** Draft/publish status derived from the row, never stored (architecture.md §3). */
export type PageStatus = "draft" | "published" | "published_with_changes";

const systemThemeIds = new Set([
    "classic",
    "learning",
    "neobrutalism",
    "editorial",
    "midnight",
]);

export class InvalidThemeReferenceError extends Error {}

async function validateThemeReference(
    teamId: string,
    themeId: string | null | undefined,
) {
    if (!themeId || systemThemeIds.has(themeId)) return;

    const theme = await db.query.themes.findFirst({
        where: eq(themes.themeId, themeId),
    });
    if (!theme || theme.teamId !== teamId) {
        throw new InvalidThemeReferenceError("Theme not found");
    }
}

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
        JSON.stringify(page.socialImage ?? null) !==
            JSON.stringify(page.draftSocialImage ?? null) ||
        (page.robotsAllowed ?? null) !== (page.draftRobotsAllowed ?? null);

    return hasChanges ? "published_with_changes" : "published";
}

async function getRawPageByPageId(pageId: string) {
    return db.query.pages.findFirst({ where: eq(pages.pageId, pageId) });
}

function hydratePage<
    T extends { layout: WidgetInstanceRow[]; draftLayout: WidgetInstanceRow[] },
>(
    page: T,
    sharedWidgets: SharedWidgetsRow,
    draftSharedWidgets: SharedWidgetsRow,
): T {
    return {
        ...page,
        layout: hydrateSharedWidgets(page.layout, sharedWidgets),
        draftLayout: hydrateSharedWidgets(page.draftLayout, draftSharedWidgets),
    };
}

export async function createPage(input: {
    teamId: string;
    name: string;
    type: PageType;
    themeId?: string;
}) {
    await validateThemeReference(input.teamId, input.themeId);
    const slug = await uniqueSlugForTeam(input.teamId, slugify(input.name));
    const requiredLayout = createRequiredSharedWidgetPlaceholders();
    const [page] = await db
        .insert(pages)
        .values({
            teamId: input.teamId,
            name: input.name,
            type: input.type,
            themeId: input.themeId,
            slug,
            layout: requiredLayout,
            draftLayout: requiredLayout,
        })
        .returning();
    const settings = await getTeamSettings(input.teamId);
    return hydratePage(
        page,
        settings.sharedWidgets,
        settings.draftSharedWidgets,
    );
}

export async function listPages(input: {
    teamId: string;
    type?: PageType;
    q?: string;
    offset?: number;
    itemsPerPage?: number;
}) {
    const conditions = [eq(pages.teamId, input.teamId)];
    if (input.type) conditions.push(eq(pages.type, input.type));
    if (input.q) conditions.push(ilike(pages.name, `%${input.q}%`));

    const offset = ((input.offset ?? 1) - 1) * (input.itemsPerPage ?? 20);
    const limit = input.itemsPerPage ?? 20;

    const [items, settings] = await Promise.all([
        db.query.pages.findMany({
            where: and(...conditions),
            limit,
            offset,
            orderBy: (row, { desc }) => desc(row.updatedAt),
        }),
        getTeamSettings(input.teamId),
    ]);
    return items.map((page) =>
        hydratePage(page, settings.sharedWidgets, settings.draftSharedWidgets),
    );
}

export async function countPages(input: {
    teamId: string;
    type?: PageType;
    q?: string;
}) {
    const conditions = [eq(pages.teamId, input.teamId)];
    if (input.type) conditions.push(eq(pages.type, input.type));
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
    const settings = await getTeamSettings(page.teamId);
    return hydratePage(
        page,
        settings.sharedWidgets,
        settings.draftSharedWidgets,
    );
}

/** Writes builder/SEO fields to draft columns. `themeId` and `slug` are
 * intentionally immediate, so they can change without publishing unrelated
 * draft content. */
export async function updatePage(
    teamId: string,
    pageId: string,
    patch: Partial<{
        name: string;
        slug: string;
        layout: WidgetInstanceRow[];
        themeId: string | null;
        title: string;
        description: string;
        socialImage: Record<string, unknown>;
        robotsAllowed: boolean;
    }>,
) {
    const existing = await getRawPageByPageId(pageId);
    if (!existing || existing.teamId !== teamId) return null;

    const {
        name,
        slug: requestedSlug,
        layout,
        title,
        description,
        socialImage,
        robotsAllowed,
        themeId,
    } = patch;
    if (themeId !== undefined) {
        await validateThemeReference(teamId, themeId);
    }
    let slug: string | undefined;
    if (requestedSlug !== undefined) {
        if (existing.slug === "") {
            throw new InvalidSlugError("The homepage URL is fixed at /.");
        }
        slug = normalizeEditableSlug(requestedSlug);
        if (await isSlugTakenForTeam(teamId, slug, existing.id)) {
            throw new SlugConflictError("That slug is already in use.");
        }
    }
    const settings =
        layout !== undefined ? await getTeamSettings(teamId) : null;
    const splitLayout =
        layout !== undefined && settings
            ? splitSubmittedLayout(layout, settings.draftSharedWidgets)
            : null;

    try {
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
            await tx
                .update(pages)
                .set({
                    ...(name !== undefined ? { name } : {}),
                    ...(slug !== undefined ? { slug } : {}),
                    ...(splitLayout
                        ? { draftLayout: splitLayout.storedLayout }
                        : {}),
                    ...(title !== undefined ? { draftTitle: title } : {}),
                    ...(description !== undefined
                        ? { draftDescription: description }
                        : {}),
                    ...(socialImage !== undefined
                        ? { draftSocialImage: socialImage }
                        : {}),
                    ...(robotsAllowed !== undefined
                        ? { draftRobotsAllowed: robotsAllowed }
                        : {}),
                    ...(themeId !== undefined ? { themeId } : {}),
                    updatedAt: new Date(),
                })
                .where(eq(pages.id, existing.id));
        });
    } catch (error) {
        if (slug !== undefined && isUniqueConstraintViolation(error)) {
            throw new SlugConflictError("That slug is already in use.");
        }
        throw error;
    }
    return getPageByPageId(pageId);
}

/** Promotes the draft state to published: copies draft_* -> published
 * columns in one update and stamps `publishedAt` (architecture.md §3). */
export async function publishPage(teamId: string, pageId: string) {
    const existing = await getRawPageByPageId(pageId);
    if (!existing || existing.teamId !== teamId) return null;
    const settings = await getTeamSettings(teamId);

    await db.transaction(async (tx) => {
        await tx
            .update(teamSettings)
            .set({
                sharedWidgets: settings.draftSharedWidgets,
                updatedAt: new Date(),
            })
            .where(eq(teamSettings.id, settings.id));
        await tx
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
            .where(eq(pages.id, existing.id));
    });
    return getPageByPageId(pageId);
}

/** Reverts the draft state back to whatever is currently published. */
export async function discardPageDraft(teamId: string, pageId: string) {
    const existing = await getRawPageByPageId(pageId);
    if (!existing || existing.teamId !== teamId) return null;
    const settings = await getTeamSettings(teamId);

    await db.transaction(async (tx) => {
        await tx
            .update(teamSettings)
            .set({
                draftSharedWidgets: settings.sharedWidgets,
                updatedAt: new Date(),
            })
            .where(eq(teamSettings.id, settings.id));
        await tx
            .update(pages)
            .set({
                draftLayout: existing.layout,
                draftTitle: existing.title,
                draftDescription: existing.description,
                draftSocialImage: existing.socialImage,
                draftRobotsAllowed: existing.robotsAllowed,
                updatedAt: new Date(),
            })
            .where(eq(pages.id, existing.id));
    });
    return getPageByPageId(pageId);
}

/** Unauthenticated, published-only reads for public site rendering
 * (architecture.md §5.4/§12.2). Never selects draft* columns. */
export async function getPublishedPageBySlug(teamId: string, slug: string) {
    const page = await db.query.pages.findFirst({
        where: and(eq(pages.teamId, teamId), eq(pages.slug, slug)),
    });
    if (!page || !page.publishedAt) return null;
    const settings = await getTeamSettings(teamId);
    return {
        ...page,
        layout: hydrateSharedWidgets(page.layout, settings.sharedWidgets),
    };
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
    const existing = await getRawPageByPageId(pageId);
    if (!existing || existing.teamId !== teamId)
        return { ok: false as const, reason: "not_found" as const };
    if (!existing.deleteable)
        return { ok: false as const, reason: "not_deleteable" as const };
    await db.delete(pages).where(eq(pages.id, existing.id));
    return { ok: true as const };
}
