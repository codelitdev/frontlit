import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeTestDb, seedTeam, type TestDb } from "../test/db";

// Hoisted by vitest above all imports below, so every module that imports
// `db` from `db/client` (including `./queries` and this file) shares one
// PGlite instance with real migrations applied.
vi.mock("../db/client", async () => ({ db: await makeTestDb() }));

import { db as testDb } from "../db/client";
import { DEFAULT_SHARED_WIDGETS, pages } from "../db/schema";
import {
  createPage,
  deletePage,
  derivePageStatus,
  discardPageDraft,
  getPageByPageId,
  publishPage,
  updatePage,
} from "./queries";
import { InvalidPageLayoutError } from "./shared-widgets";
import { InvalidSlugError, SlugConflictError } from "../utils/slug";
import { listMedia } from "../media/queries";

function pageLayout(
  body: Array<{
    widgetId: string;
    name: string;
    deletable: boolean;
    moveable: boolean;
    shared: boolean;
  }> = [],
  headerSettings: Record<string, unknown> = {},
  footerSettings: Record<string, unknown> = {},
) {
  return [
    {
      widgetId: "header-1",
      name: "header",
      deletable: false,
      moveable: false,
      shared: true,
      settings: headerSettings,
    },
    ...body,
    {
      widgetId: "footer-1",
      name: "footer",
      deletable: false,
      moveable: false,
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
    });

    expect(page.slug).toBe("about-us");
    expect(page.deletable).toBe(true);
    expect(page.publishedAt).toBeNull();
    expect(page.layout.map((widget) => widget.name)).toEqual(["header", "footer"]);
    expect(page.draftLayout.map((widget) => widget.name)).toEqual(["header", "footer"]);
    expect(page.layout.every((widget) => widget.shared && !widget.deletable)).toBe(
      true,
    );
    expect(derivePageStatus(page)).toBe("draft");
  });

  it("uniquifies slugs within a team", async () => {
    const first = await createPage({
      teamId,
      name: "Pricing",
    });
    const second = await createPage({
      teamId,
      name: "Pricing",
    });

    expect(first.slug).toBe("pricing");
    expect(second.slug).toBe("pricing-2");
  });

  it("normalizes an explicitly edited slug", async () => {
    const page = await createPage({
      teamId,
      name: "Pricing",
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
    });
    const about = await createPage({
      teamId,
      name: "About",
    });

    await expect(
      updatePage(teamId, about.pageId, { slug: pricing.slug }),
    ).rejects.toBeInstanceOf(SlugConflictError);
  });

  it("keeps the homepage at the root URL", async () => {
    const homepage = await createPage({
      teamId,
      name: "Homepage",
    });
    await db.update(pages).set({ slug: "" }).where(eq(pages.id, homepage.id));

    await expect(
      updatePage(teamId, homepage.pageId, { slug: "new-home" }),
    ).rejects.toBeInstanceOf(InvalidSlugError);
  });

  it("keeps every standard page at its reserved URL", async () => {
    const page = await createPage({
      teamId,
      name: "Docs",
    });
    await db
      .update(pages)
      .set({ slug: "docs", deletable: false })
      .where(eq(pages.id, page.id));

    await expect(
      updatePage(teamId, page.pageId, { slug: "guides" }),
    ).rejects.toBeInstanceOf(InvalidSlugError);
  });

  it("update writes only the draft columns, leaving published fields untouched", async () => {
    const created = await createPage({
      teamId,
      name: "Home",
    });

    const updated = await updatePage(teamId, created.pageId, {
      layout: pageLayout([
        {
          widgetId: "w1",
          name: "hero",
          deletable: true,
          moveable: true,
          shared: false,
        },
      ]),
      title: "Welcome",
    });

    expect(updated?.draftLayout).toHaveLength(3);
    expect(updated?.draftTitle).toBe("Welcome");
    expect(updated?.layout.map((widget) => widget.name)).toEqual(["header", "footer"]);
    expect(updated?.title).toBeNull();
    expect(derivePageStatus(updated!)).toBe("draft");
  });

  it("publish copies draft fields into published fields and stamps publishedAt", async () => {
    const created = await createPage({
      teamId,
      name: "Home",
    });
    await updatePage(teamId, created.pageId, {
      layout: pageLayout([
        {
          widgetId: "w1",
          name: "hero",
          deletable: true,
          moveable: true,
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
    });
    await updatePage(teamId, created.pageId, { title: "V1" });
    await publishPage(teamId, created.pageId);
    await updatePage(teamId, created.pageId, { title: "V2 (unpublished)" });

    const discarded = await discardPageDraft(teamId, created.pageId);

    expect(discarded?.draftTitle).toBe("V1");
    expect(derivePageStatus(discarded!)).toBe("published");
  });

  it("shares draft and published header/footer settings across every team page", async () => {
    const first = await createPage({ teamId, name: "First" });
    const second = await createPage({
      teamId,
      name: "Second",
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
    expect(secondDraft?.layout[0].settings).toEqual(
      DEFAULT_SHARED_WIDGETS.header.settings,
    );

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
    });
    const bodyOnly = [
      {
        widgetId: "hero-1",
        name: "hero",
        deletable: true,
        moveable: true,
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

  it("requires one moveable, non-deletable FrontLit data slot on dynamic standard pages", async () => {
    const created = await createPage({
      teamId,
      name: "Docs",
    });
    await db
      .update(pages)
      .set({ slug: "docs", deletable: false })
      .where(eq(pages.id, created.id));

    const standardPage = await getPageByPageId(created.pageId);
    const content = standardPage!.draftLayout.find(
      (widget) => widget.name === "data-slot",
    )!;
    const [header, footer] = pageLayout();
    const pricing = {
      widgetId: "pricing-1",
      name: "pricing",
      deletable: true,
      moveable: true,
      shared: false,
    };

    const updated = await updatePage(teamId, created.pageId, {
      layout: [
        header,
        pricing,
        { ...content, deletable: true, moveable: false },
        footer,
      ],
    });
    expect(updated?.draftLayout.map((widget) => widget.name)).toEqual([
      "header",
      "pricing",
      "data-slot",
      "footer",
    ]);
    expect(
      updated?.draftLayout.find((widget) => widget.name === "data-slot"),
    ).toMatchObject({
      deletable: false,
      moveable: true,
      shared: false,
      settings: {
        slot: "frontlit.content-feed",
        source: "documentation",
      },
    });

    await expect(
      updatePage(teamId, created.pageId, {
        layout: [header, pricing, footer],
      }),
    ).rejects.toBeInstanceOf(InvalidPageLayoutError);
    await expect(
      updatePage(teamId, created.pageId, {
        layout: [header, content, content, footer],
      }),
    ).rejects.toBeInstanceOf(InvalidPageLayoutError);
  });

  it("publish/update/discard are team-scoped and no-op for another team", async () => {
    const created = await createPage({
      teamId,
      name: "Home",
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

  it("deletes a deletable page", async () => {
    const created = await createPage({
      teamId,
      name: "Scratch",
    });
    const result = await deletePage(teamId, created.pageId);

    expect(result.ok).toBe(true);
    expect(await getPageByPageId(created.pageId)).toBeUndefined();
  });

  it("refuses to delete a non-deletable (standard) page", async () => {
    const created = await createPage({
      teamId,
      name: "Homepage",
    });
    await db.update(pages).set({ deletable: false }).where(eq(pages.id, created.id));

    const result = await deletePage(teamId, created.pageId);

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe("not_deletable");
    expect(await getPageByPageId(created.pageId)).not.toBeUndefined();
  });

  describe("social images and media library reflection", () => {
    it("updates page with Unsplash social image and never adds it to media library", async () => {
      const page = await createPage({ teamId, name: "Features" });
      const updated = await updatePage(teamId, page.pageId, {
        socialImage:
          "https://images.unsplash.com/photo-1579783902614-a3fb3927b675?auto=format",
      });

      expect(updated?.draftSocialImage).toMatchObject({
        url: "https://images.unsplash.com/photo-1579783902614-a3fb3927b675?auto=format",
      });

      const media = await listMedia({ teamId });
      expect(media).toHaveLength(0);
    });

    it("updates page with external MediaLit format, promotes upon publish", async () => {
      const page = await createPage({ teamId, name: "Pricing" });
      const updated = await updatePage(teamId, page.pageId, {
        socialImage: {
          file: "https://medialit.example/card.png",
          thumbnail: "https://medialit.example/thumb.png",
          mediaId: "ml_page_123",
          alt: "Pricing Social Card",
        },
      });

      expect(updated?.draftSocialImage).toMatchObject({
        url: "https://medialit.example/card.png",
        thumbnailUrl: "https://medialit.example/thumb.png",
        mediaLitId: "ml_page_123",
        alt: "Pricing Social Card",
      });

      const published = await publishPage(teamId, page.pageId);
      expect(published?.socialImage).toMatchObject({
        url: "https://medialit.example/card.png",
        thumbnailUrl: "https://medialit.example/thumb.png",
        mediaLitId: "ml_page_123",
        alt: "Pricing Social Card",
      });

      const media = await listMedia({ teamId });
      const found = media.find((m) => m.url === "https://medialit.example/card.png");
      expect(found).toBeDefined();
      expect(found?.mediaLitId).toBe("ml_page_123");
      expect(found?.thumbnailUrl).toBe("https://medialit.example/thumb.png");
      expect(found?.alt).toBe("Pricing Social Card");
    });
  });
});
