import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeTestDb, seedTeam, type TestDb } from "../test/db";

// Hoisted by vitest above all imports below, so every module that imports
// `db` from `db/client` (including `./queries` and this file) shares one
// PGlite instance with real migrations applied.
vi.mock("../db/client", async () => ({ db: await makeTestDb() }));

import { db as testDb } from "../db/client";
import { pages } from "../db/schema";
import {
    createPage,
    deletePage,
    derivePageStatus,
    discardPageDraft,
    getPageByPageId,
    InvalidThemeReferenceError,
    publishPage,
    updatePage,
} from "./queries";
import { InvalidPageLayoutError } from "./shared-widgets";
import { createTheme, deleteTheme } from "../themes/queries";
import { InvalidSlugError, SlugConflictError } from "../utils/slug";

function pageLayout(
    body: Array<{
        widgetId: string;
        name: string;
        deleteable: boolean;
        shared: boolean;
    }> = [],
    headerSettings: Record<string, unknown> = {},
    footerSettings: Record<string, unknown> = {},
) {
    return [
        {
            widgetId: "header-1",
            name: "header",
            deleteable: false,
            shared: true,
            settings: headerSettings,
        },
        ...body,
        {
            widgetId: "footer-1",
            name: "footer",
            deleteable: false,
            shared: true,
            settings: footerSettings,
        },
    ];
}

describe("pages draft/publish", () => {
    const db = testDb as unknown as TestDb;
    let teamId: string;

    beforeEach(async () => {
        const seeded = await seedTeam(db);
        teamId = seeded.team.id;
    });

    it("creates a page with locked shared blocks and no published state", async () => {
        const page = await createPage({
            teamId,
            name: "About Us",
            type: "custom",
        });

        expect(page.slug).toBe("about-us");
        expect(page.deleteable).toBe(true);
        expect(page.publishedAt).toBeNull();
        expect(page.layout.map((widget) => widget.name)).toEqual([
            "header",
            "footer",
        ]);
        expect(page.draftLayout.map((widget) => widget.name)).toEqual([
            "header",
            "footer",
        ]);
        expect(
            page.layout.every((widget) => widget.shared && !widget.deleteable),
        ).toBe(true);
        expect(derivePageStatus(page)).toBe("draft");
    });

    it("stores built-in theme IDs as page theme references", async () => {
        const page = await createPage({
            teamId,
            name: "Learning",
            type: "site",
            themeId: "learning",
        });

        expect(page.themeId).toBe("learning");

        const updated = await updatePage(teamId, page.pageId, {
            themeId: "editorial",
        });

        expect(updated?.themeId).toBe("editorial");
    });

    it("clears page references when a custom theme is deleted", async () => {
        const theme = await createTheme({
            teamId,
            name: "Custom",
            style: { colors: {} },
        });
        const page = await createPage({
            teamId,
            name: "Themed",
            type: "site",
            themeId: theme.themeId,
        });

        await deleteTheme(teamId, theme.themeId);

        expect((await getPageByPageId(page.pageId))?.themeId).toBeNull();
    });

    it("rejects custom themes owned by another team", async () => {
        const { team: otherTeam } = await seedTeam(db, { name: "Other" });
        const otherTheme = await createTheme({
            teamId: otherTeam.id,
            name: "Private",
            style: { colors: {} },
        });

        await expect(
            createPage({
                teamId,
                name: "Cross-tenant",
                type: "site",
                themeId: otherTheme.themeId,
            }),
        ).rejects.toBeInstanceOf(InvalidThemeReferenceError);
    });

    it("uniquifies slugs within a team", async () => {
        const first = await createPage({
            teamId,
            name: "Pricing",
            type: "custom",
        });
        const second = await createPage({
            teamId,
            name: "Pricing",
            type: "custom",
        });

        expect(first.slug).toBe("pricing");
        expect(second.slug).toBe("pricing-2");
    });

    it("normalizes an explicitly edited slug", async () => {
        const page = await createPage({
            teamId,
            name: "Pricing",
            type: "custom",
        });

        const updated = await updatePage(teamId, page.pageId, {
            slug: "  Enterprise Pricing  ",
        });

        expect(updated?.slug).toBe("enterprise-pricing");
    });

    it("rejects an edited slug already used by another page in the team", async () => {
        const pricing = await createPage({
            teamId,
            name: "Pricing",
            type: "custom",
        });
        const about = await createPage({
            teamId,
            name: "About",
            type: "custom",
        });

        await expect(
            updatePage(teamId, about.pageId, { slug: pricing.slug }),
        ).rejects.toBeInstanceOf(SlugConflictError);
    });

    it("keeps the homepage at the root URL", async () => {
        const homepage = await createPage({
            teamId,
            name: "Homepage",
            type: "site",
        });
        await db
            .update(pages)
            .set({ slug: "" })
            .where(eq(pages.id, homepage.id));

        await expect(
            updatePage(teamId, homepage.pageId, { slug: "new-home" }),
        ).rejects.toBeInstanceOf(InvalidSlugError);
    });

    it("update writes only the draft columns, leaving published fields untouched", async () => {
        const created = await createPage({
            teamId,
            name: "Home",
            type: "site",
        });

        const updated = await updatePage(teamId, created.pageId, {
            layout: pageLayout([
                {
                    widgetId: "w1",
                    name: "hero",
                    deleteable: true,
                    shared: false,
                },
            ]),
            title: "Welcome",
        });

        expect(updated?.draftLayout).toHaveLength(3);
        expect(updated?.draftTitle).toBe("Welcome");
        expect(updated?.layout.map((widget) => widget.name)).toEqual([
            "header",
            "footer",
        ]);
        expect(updated?.title).toBeNull();
        expect(derivePageStatus(updated!)).toBe("draft");
    });

    it("publish copies draft fields into published fields and stamps publishedAt", async () => {
        const created = await createPage({
            teamId,
            name: "Home",
            type: "site",
        });
        await updatePage(teamId, created.pageId, {
            layout: pageLayout([
                {
                    widgetId: "w1",
                    name: "hero",
                    deleteable: true,
                    shared: false,
                },
            ]),
            title: "Welcome",
        });

        const published = await publishPage(teamId, created.pageId);

        expect(published?.publishedAt).not.toBeNull();
        expect(published?.layout).toEqual(published?.draftLayout);
        expect(published?.title).toBe("Welcome");
        expect(derivePageStatus(published!)).toBe("published");
    });

    it("further draft edits after publish show published_with_changes", async () => {
        const created = await createPage({
            teamId,
            name: "Home",
            type: "site",
        });
        await publishPage(teamId, created.pageId);
        const edited = await updatePage(teamId, created.pageId, {
            title: "New title",
        });

        expect(derivePageStatus(edited!)).toBe("published_with_changes");
    });

    it("discard-draft resets the draft back to the published state", async () => {
        const created = await createPage({
            teamId,
            name: "Home",
            type: "site",
        });
        await updatePage(teamId, created.pageId, { title: "V1" });
        await publishPage(teamId, created.pageId);
        await updatePage(teamId, created.pageId, { title: "V2 (unpublished)" });

        const discarded = await discardPageDraft(teamId, created.pageId);

        expect(discarded?.draftTitle).toBe("V1");
        expect(derivePageStatus(discarded!)).toBe("published");
    });

    it("shares draft and published header/footer settings across every team page", async () => {
        const first = await createPage({ teamId, name: "First", type: "site" });
        const second = await createPage({
            teamId,
            name: "Second",
            type: "custom",
        });
        await publishPage(teamId, first.pageId);
        await publishPage(teamId, second.pageId);

        await updatePage(teamId, first.pageId, {
            layout: pageLayout(
                [],
                { logoText: "Acme navigation" },
                { copyrightText: "© Acme" },
            ),
        });

        const secondDraft = await getPageByPageId(second.pageId);
        expect(secondDraft?.draftLayout[0].settings).toMatchObject({
            logoText: "Acme navigation",
        });
        expect(secondDraft?.draftLayout.at(-1)?.settings).toMatchObject({
            copyrightText: "© Acme",
        });
        expect(secondDraft?.layout[0].settings).toEqual({});

        await publishPage(teamId, first.pageId);
        const secondPublished = await getPageByPageId(second.pageId);
        expect(secondPublished?.layout[0].settings).toMatchObject({
            logoText: "Acme navigation",
        });
        expect(secondPublished?.layout.at(-1)?.settings).toMatchObject({
            copyrightText: "© Acme",
        });

        const storedSecond = await db.query.pages.findFirst({
            where: eq(pages.id, second.id),
        });
        expect(storedSecond?.layout[0].settings).toBeUndefined();
        expect(storedSecond?.layout.at(-1)?.settings).toBeUndefined();
    });

    it("rejects layouts that remove or duplicate mandatory shared blocks", async () => {
        const page = await createPage({
            teamId,
            name: "Guarded",
            type: "site",
        });
        const bodyOnly = [
            {
                widgetId: "hero-1",
                name: "hero",
                deleteable: true,
                shared: false,
            },
        ];

        await expect(
            updatePage(teamId, page.pageId, { layout: bodyOnly }),
        ).rejects.toBeInstanceOf(InvalidPageLayoutError);
        await expect(
            updatePage(teamId, page.pageId, {
                layout: [pageLayout()[0], pageLayout()[0], pageLayout()[1]],
            }),
        ).rejects.toBeInstanceOf(InvalidPageLayoutError);
    });

    it("publish/update/discard are team-scoped and no-op for another team", async () => {
        const created = await createPage({
            teamId,
            name: "Home",
            type: "site",
        });
        const { team: otherTeam } = await seedTeam(db, { name: "Other" });

        expect(
            await updatePage(otherTeam.id, created.pageId, {
                title: "hijacked",
            }),
        ).toBeNull();
        expect(await publishPage(otherTeam.id, created.pageId)).toBeNull();
        expect(await discardPageDraft(otherTeam.id, created.pageId)).toBeNull();

        const untouched = await getPageByPageId(created.pageId);
        expect(untouched?.draftTitle).toBeNull();
    });

    it("deletes a deleteable page", async () => {
        const created = await createPage({
            teamId,
            name: "Scratch",
            type: "custom",
        });
        const result = await deletePage(teamId, created.pageId);

        expect(result.ok).toBe(true);
        expect(await getPageByPageId(created.pageId)).toBeUndefined();
    });

    it("refuses to delete a non-deleteable (standard) page", async () => {
        const created = await createPage({
            teamId,
            name: "Homepage",
            type: "site",
        });
        await db
            .update(pages)
            .set({ deleteable: false })
            .where(eq(pages.id, created.id));

        const result = await deletePage(teamId, created.pageId);

        expect(result.ok).toBe(false);
        expect(result.ok === false && result.reason).toBe("not_deleteable");
        expect(await getPageByPageId(created.pageId)).not.toBeUndefined();
    });
});
