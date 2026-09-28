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
    const home = (await db.select().from(pages).where(eq(pages.teamId, teamId))).find(
      (page) => page.slug === "",
    );

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

    const featured = home?.layout.find((widget) => widget.name === "featured");
    const pricing = home?.layout.find((widget) => widget.name === "pricing");
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

  it("seeds all 7 standard pages by default when requestedPages is omitted", async () => {
    const allPages = await db.select().from(pages).where(eq(pages.teamId, teamId));
    const slugs = allPages.map((p) => p.slug).sort();
    expect(slugs).toEqual(
      ["", "blog", "changelog", "docs", "help", "privacy", "terms"].sort(),
    );
    expect(allPages.every((p) => p.deletable === false)).toBe(true);
    expect(allPages.every((p) => p.publishedAt !== null)).toBe(true);
  });

  it("seeds only specified standard pages when requested", async () => {
    const customTeam = await seedTeam(db);
    await seedStandardPages(customTeam.team.id, ["blog", "help"]);

    const seeded = await db
      .select()
      .from(pages)
      .where(eq(pages.teamId, customTeam.team.id));
    expect(seeded.map((p) => p.slug).sort()).toEqual(["blog", "help"]);
    expect(
      seeded
        .find((p) => p.slug === "help")
        ?.layout.some((w) => w.name === "support-form"),
    ).toBe(true);
  });

  it("seeds nothing when requestedPages is an empty array", async () => {
    const emptyTeam = await seedTeam(db);
    await seedStandardPages(emptyTeam.team.id, []);

    const seeded = await db
      .select()
      .from(pages)
      .where(eq(pages.teamId, emptyTeam.team.id));
    expect(seeded).toHaveLength(0);
  });

  it("supports slug aliases and custom page definitions with overrides", async () => {
    const customTeam = await seedTeam(db);
    await seedStandardPages(customTeam.team.id, [
      "homepage",
      { slug: "docs", title: "CourseLit Documentation" },
      { slug: "faq", name: "FAQ", title: "Helpful Answers" },
    ]);

    const seeded = await db
      .select()
      .from(pages)
      .where(eq(pages.teamId, customTeam.team.id));
    const bySlug = new Map(seeded.map((p) => [p.slug, p]));

    expect(bySlug.has("")).toBe(true); // "homepage" -> ""
    expect(bySlug.get("")?.name).toBe("Homepage");

    expect(bySlug.get("docs")?.title).toBe("CourseLit Documentation");
    expect(bySlug.get("docs")?.deletable).toBe(false);

    const faq = bySlug.get("faq");
    expect(faq?.name).toBe("FAQ");
    expect(faq?.title).toBe("Helpful Answers");
    expect(faq?.deletable).toBe(true);
  });

  it("respects deletable overrides and custom layouts for pages", async () => {
    const customTeam = await seedTeam(db);
    await seedStandardPages(customTeam.team.id, [
      { slug: "docs", deletable: true },
      {
        slug: "terms",
        deletable: false,
        layout: [
          {
            widgetId: "custom-block",
            name: "rich-text",
            deletable: true,
            moveable: true,
            shared: false,
            settings: { title: "Terms of Service" },
          },
        ],
      },
      { slug: "guide", deletable: false },
    ]);

    const seeded = await db
      .select()
      .from(pages)
      .where(eq(pages.teamId, customTeam.team.id));
    const bySlug = new Map(seeded.map((p) => [p.slug, p]));

    // Standard page explicitly made deletable
    expect(bySlug.get("docs")?.deletable).toBe(true);

    // Standard page with custom layout preserves header & footer placeholders
    const terms = bySlug.get("terms");
    expect(terms?.deletable).toBe(false);
    expect(terms?.layout.some((w) => w.name === "header")).toBe(true);
    expect(terms?.layout.some((w) => w.name === "footer")).toBe(true);
    expect(terms?.layout.some((w) => w.widgetId === "custom-block")).toBe(true);

    // Custom page explicitly made non-deletable
    expect(bySlug.get("guide")?.deletable).toBe(false);
  });

  it("seeds requested pages with socialImage and syncs to media library", async () => {
    const customTeam = await seedTeam(db);
    const { listMedia } = await import("../media/queries");

    await seedStandardPages(customTeam.team.id, [
      {
        slug: "about",
        name: "About Us",
        socialImage: {
          file: "https://cdn.example.com/about-og.png",
          thumbnail: "https://cdn.example.com/about-thumb.png",
          alt: "About FrontLit",
        },
      },
    ]);

    const seeded = await db
      .select()
      .from(pages)
      .where(eq(pages.teamId, customTeam.team.id));
    const aboutPage = seeded.find((p) => p.slug === "about");

    expect(aboutPage).toBeDefined();
    expect(aboutPage?.socialImage).toMatchObject({
      url: "https://cdn.example.com/about-og.png",
      thumbnailUrl: "https://cdn.example.com/about-thumb.png",
      alt: "About FrontLit",
    });
    expect(aboutPage?.draftSocialImage).toMatchObject({
      url: "https://cdn.example.com/about-og.png",
    });

    const media = await listMedia({ teamId: customTeam.team.id });
    expect(media.some((m) => m.url === "https://cdn.example.com/about-og.png")).toBe(
      true,
    );
  });
});
