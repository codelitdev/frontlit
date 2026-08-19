import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeTestDb, seedTeam, type TestDb } from "../test/db";

vi.mock("../db/client", async () => ({ db: await makeTestDb() }));

import { db as testDb } from "../db/client";
import { pages } from "../db/schema";
import { createHomepageBody, seedStandardPages } from "./seed";

const PUBLIC_HREF =
    /^\/(blog|docs|help|changelog|terms|privacy)$|^\/#(features|pricing)$/;

function collectedHrefs(value: unknown, acc: string[] = []): string[] {
    if (Array.isArray(value)) {
        for (const item of value) collectedHrefs(item, acc);
        return acc;
    }
    if (value && typeof value === "object") {
        for (const [key, nested] of Object.entries(value)) {
            if (
                (key === "href" ||
                    key === "buttonAction" ||
                    key === "ctaHref" ||
                    key === "secondaryButtonAction") &&
                typeof nested === "string"
            ) {
                acc.push(nested);
            } else {
                collectedHrefs(nested, acc);
            }
        }
    }
    return acc;
}

describe("seedStandardPages", () => {
    const db = testDb as unknown as TestDb;
    let teamId: string;

    beforeEach(async () => {
        const seeded = await seedTeam(db);
        teamId = seeded.team.id;
        await seedStandardPages(teamId);
    });

    it("publishes a FrontLit marketing homepage with section anchors", async () => {
        const home = (
            await db.select().from(pages).where(eq(pages.teamId, teamId))
        ).find((page) => page.slug === "");

        expect(home).toBeDefined();
        expect(home?.title).toMatch(/FrontLit/);
        expect(home?.publishedAt).not.toBeNull();
        expect(home?.layout.map((widget) => widget.name)).toEqual([
            "header",
            "hero",
            "featured",
            "grid",
            "pricing",
            "faq",
            "banner",
            "footer",
        ]);

        const featured = home?.layout.find(
            (widget) => widget.name === "featured",
        );
        const pricing = home?.layout.find(
            (widget) => widget.name === "pricing",
        );
        expect(featured?.settings?.cssId).toBe("features");
        expect(pricing?.settings?.cssId).toBe("pricing");
    });

    it("points every homepage href at a seeded public page or in-page section", () => {
        const hrefs = collectedHrefs(createHomepageBody());
        expect(hrefs.length).toBeGreaterThan(0);
        expect(hrefs.every((href) => PUBLIC_HREF.test(href))).toBe(true);
        expect(hrefs).toEqual(
            expect.arrayContaining(["/blog", "/docs", "/help", "/changelog"]),
        );
        expect(hrefs).not.toContain("#");
    });
});
