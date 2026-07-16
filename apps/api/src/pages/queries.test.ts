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
    publishPage,
    updatePage,
} from "./queries";

describe("pages draft/publish", () => {
    const db = testDb as unknown as TestDb;
    let teamId: string;

    beforeEach(async () => {
        const seeded = await seedTeam(db);
        teamId = seeded.team.id;
    });

    it("creates a page with an empty draft and no published state", async () => {
        const page = await createPage({ teamId, name: "About Us", type: "custom" });

        expect(page.slug).toBe("about-us");
        expect(page.deleteable).toBe(true);
        expect(page.publishedAt).toBeNull();
        expect(page.layout).toEqual([]);
        expect(page.draftLayout).toEqual([]);
        expect(derivePageStatus(page)).toBe("draft");
    });

    it("uniquifies slugs within a team", async () => {
        const first = await createPage({ teamId, name: "Pricing", type: "custom" });
        const second = await createPage({ teamId, name: "Pricing", type: "custom" });

        expect(first.slug).toBe("pricing");
        expect(second.slug).toBe("pricing-2");
    });

    it("update writes only the draft columns, leaving published fields untouched", async () => {
        const created = await createPage({ teamId, name: "Home", type: "site" });

        const updated = await updatePage(teamId, created.pageId, {
            layout: [{ widgetId: "w1", name: "hero", deleteable: true, shared: false }],
            title: "Welcome",
        });

        expect(updated?.draftLayout).toHaveLength(1);
        expect(updated?.draftTitle).toBe("Welcome");
        expect(updated?.layout).toEqual([]);
        expect(updated?.title).toBeNull();
        expect(derivePageStatus(updated!)).toBe("draft");
    });

    it("publish copies draft fields into published fields and stamps publishedAt", async () => {
        const created = await createPage({ teamId, name: "Home", type: "site" });
        await updatePage(teamId, created.pageId, {
            layout: [{ widgetId: "w1", name: "hero", deleteable: true, shared: false }],
            title: "Welcome",
        });

        const published = await publishPage(teamId, created.pageId);

        expect(published?.publishedAt).not.toBeNull();
        expect(published?.layout).toEqual(published?.draftLayout);
        expect(published?.title).toBe("Welcome");
        expect(derivePageStatus(published!)).toBe("published");
    });

    it("further draft edits after publish show published_with_changes", async () => {
        const created = await createPage({ teamId, name: "Home", type: "site" });
        await publishPage(teamId, created.pageId);
        const edited = await updatePage(teamId, created.pageId, { title: "New title" });

        expect(derivePageStatus(edited!)).toBe("published_with_changes");
    });

    it("discard-draft resets the draft back to the published state", async () => {
        const created = await createPage({ teamId, name: "Home", type: "site" });
        await updatePage(teamId, created.pageId, { title: "V1" });
        await publishPage(teamId, created.pageId);
        await updatePage(teamId, created.pageId, { title: "V2 (unpublished)" });

        const discarded = await discardPageDraft(teamId, created.pageId);

        expect(discarded?.draftTitle).toBe("V1");
        expect(derivePageStatus(discarded!)).toBe("published");
    });

    it("publish/update/discard are team-scoped and no-op for another team", async () => {
        const created = await createPage({ teamId, name: "Home", type: "site" });
        const { team: otherTeam } = await seedTeam(db, { name: "Other" });

        expect(await updatePage(otherTeam.id, created.pageId, { title: "hijacked" })).toBeNull();
        expect(await publishPage(otherTeam.id, created.pageId)).toBeNull();
        expect(await discardPageDraft(otherTeam.id, created.pageId)).toBeNull();

        const untouched = await getPageByPageId(created.pageId);
        expect(untouched?.draftTitle).toBeNull();
    });

    it("deletes a deleteable page", async () => {
        const created = await createPage({ teamId, name: "Scratch", type: "custom" });
        const result = await deletePage(teamId, created.pageId);

        expect(result.ok).toBe(true);
        expect(await getPageByPageId(created.pageId)).toBeUndefined();
    });

    it("refuses to delete a non-deleteable (standard) page", async () => {
        const created = await createPage({ teamId, name: "Homepage", type: "site" });
        await db.update(pages).set({ deleteable: false }).where(eq(pages.id, created.id));

        const result = await deletePage(teamId, created.pageId);

        expect(result.ok).toBe(false);
        expect(result.ok === false && result.reason).toBe("not_deleteable");
        expect(await getPageByPageId(created.pageId)).not.toBeUndefined();
    });
});
