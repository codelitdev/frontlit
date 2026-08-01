import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeTestDb, seedTeam, type TestDb } from "../test/db";

vi.mock("../db/client", async () => ({ db: await makeTestDb() }));

import { db as testDb } from "../db/client";
import { pages as pagesTable } from "../db/schema";
import { createPage } from "../pages/queries";
import {
    createTheme,
    deleteTheme,
    getThemeByThemeId,
    listThemes,
    updateTheme,
} from "./queries";

describe("themes", () => {
    const db = testDb as unknown as TestDb;
    let teamId: string;
    let otherTeamId: string;

    beforeEach(async () => {
        const seeded = await seedTeam(db);
        const other = await seedTeam(db, { name: "Other team" });
        teamId = seeded.team.id;
        otherTeamId = other.team.id;
    });

    it("creates, lists, updates, and deletes themes for a team", async () => {
        const theme = await createTheme({
            teamId,
            name: "Brand",
            style: { primary: "#112233" },
        });
        expect(theme.themeId).toMatch(/^thm_/);
        expect(theme.name).toBe("Brand");
        expect(theme.style).toEqual({ primary: "#112233" });

        expect(await getThemeByThemeId(theme.themeId)).toMatchObject({
            id: theme.id,
            teamId,
            name: "Brand",
        });

        const listed = await listThemes(teamId);
        expect(listed.map((row) => row.themeId)).toEqual([theme.themeId]);

        const updated = await updateTheme(teamId, theme.themeId, {
            name: "Brand v2",
            style: { primary: "#445566" },
        });
        expect(updated).toMatchObject({
            themeId: theme.themeId,
            name: "Brand v2",
            style: { primary: "#445566" },
        });

        await deleteTheme(teamId, theme.themeId);
        expect(await getThemeByThemeId(theme.themeId)).toBeUndefined();
        expect(await listThemes(teamId)).toEqual([]);
    });

    it("scopes update/delete to the owning team and clears page theme refs on delete", async () => {
        const theme = await createTheme({
            teamId,
            name: "Owned",
            style: { primary: "#000000" },
        });
        const page = await createPage({
            teamId,
            name: "Themed page",
            type: "custom",
            themeId: theme.themeId,
        });
        expect(page.themeId).toBe(theme.themeId);

        expect(
            await updateTheme(otherTeamId, theme.themeId, { name: "Hijack" }),
        ).toBeNull();
        expect((await getThemeByThemeId(theme.themeId))?.name).toBe("Owned");

        await deleteTheme(otherTeamId, theme.themeId);
        expect(await getThemeByThemeId(theme.themeId)).toMatchObject({
            themeId: theme.themeId,
        });

        await deleteTheme(teamId, theme.themeId);
        expect(await getThemeByThemeId(theme.themeId)).toBeUndefined();

        const pages = await db.query.pages.findMany({
            where: eq(pagesTable.teamId, teamId),
        });
        const themed = pages.find((row) => row.pageId === page.pageId);
        expect(themed?.themeId).toBeNull();
    });
});
