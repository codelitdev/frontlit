import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeTestDb, seedTeam, type TestDb } from "../test/db";

// Hoisted by vitest above all imports below, so every module that imports
// `db` from `db/client` (including `./queries` and this file) shares one
// PGlite instance with real migrations applied.
vi.mock("../db/client", async () => ({ db: await makeTestDb() }));
vi.mock("../media/service", async (original) => ({
  ...(await original<typeof import("../media/service")>()),
  mediaLitBindsSignedGroups: async () => false,
}));

import { db as testDb } from "../db/client";
import { pages } from "../db/schema";
import {
  createPage,
  deletePage,
  derivePageStatus,
  discardPageDraft,
  getPageByPageId,
  getPublishedPageBySlug,
  publishPage,
  updatePage,
} from "./queries";
import { activateRelease, getActiveRelease, listReleases } from "./releases";
import { getTeamSettings } from "../settings/queries";
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
    expect(page.layout).toEqual([]);
    expect(page.draftLayout.map((widget) => widget.name)).toEqual(["header", "footer"]);
    expect(page.draftLayout.every((widget) => widget.shared && !widget.deletable)).toBe(
      true,
    );
    expect(page.status).toBe("draft");
    expect(derivePageStatus(page, null)).toBe("draft");
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
    expect(updated?.layout).toEqual([]);
    expect(updated?.title).toBeNull();
    expect(updated?.publishedAt).toBeNull();
    expect(updated?.status).toBe("draft");
    expect(await getActiveRelease(teamId)).toBeNull();
  });

  it("publish puts the draft in a new active release and stamps publishedAt", async () => {
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

    const release = await getActiveRelease(teamId);
    expect(release).not.toBeNull();
    expect(published?.publishedAt).toEqual(release!.createdAt);
    // Published widget ids are positional; names and order match the draft.
    expect(published?.layout.map((widget) => widget.name)).toEqual(
      published?.draftLayout.map((widget) => widget.name),
    );
    expect(published?.layout.map((widget) => widget.widgetId)).toContain("home-1");
    expect(published?.title).toBe("Welcome");
    expect(published?.status).toBe("published");

    const live = await getPublishedPageBySlug(teamId, "home");
    expect(live?.title).toBe("Welcome");
    expect(live?.pageId).toBe(created.pageId);
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

    expect(edited?.status).toBe("published_with_changes");
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
    expect(discarded?.status).toBe("published");
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
        { ctaLabel: "Acme navigation" },
        { copyrightText: "© Acme" },
      ),
    });

    const secondDraft = await getPageByPageId(second.pageId);
    expect(secondDraft?.draftLayout[0].settings).toMatchObject({
      ctaLabel: "Acme navigation",
    });
    expect(secondDraft?.draftLayout.at(-1)?.settings).toMatchObject({
      copyrightText: "© Acme",
    });
    expect(secondDraft?.layout[0].settings).not.toMatchObject({
      ctaLabel: "Acme navigation",
    });

    await publishPage(teamId, first.pageId);
    const secondPublished = await getPageByPageId(second.pageId);
    expect(secondPublished?.layout[0].settings).toMatchObject({
      ctaLabel: "Acme navigation",
    });
    expect(secondPublished?.layout.at(-1)?.settings).toMatchObject({
      copyrightText: "© Acme",
    });

    const storedSecond = await db.query.pages.findFirst({
      where: eq(pages.id, second.id),
    });
    // Chrome lives on team settings / the release, not on page rows.
    expect(storedSecond?.draftLayout[0].settings).toBeUndefined();
    expect(storedSecond?.draftLayout.at(-1)?.settings).toBeUndefined();
    const release = await getActiveRelease(teamId);
    expect(release?.site.header).toMatchObject({ ctaLabel: "Acme navigation" });
    expect(release?.site.footer).toMatchObject({ copyrightText: "© Acme" });
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
        slot: "content-feed",
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

  describe("site releases", () => {
    it("each publish activates a new release; unchanged content reuses its revision", async () => {
      const page = await createPage({ teamId, name: "Pricing" });
      await updatePage(teamId, page.pageId, { title: "Plans" });

      await publishPage(teamId, page.pageId);
      const first = await getActiveRelease(teamId);
      await publishPage(teamId, page.pageId);
      const second = await getActiveRelease(teamId);

      expect(first).not.toBeNull();
      expect(second).not.toBeNull();
      expect(second!.id).not.toBe(first!.id);
      expect((await getTeamSettings(teamId)).activeReleaseId).toBe(second!.id);

      const firstEntry = first!.pages.find((entry) => entry.slug === "pricing");
      const secondEntry = second!.pages.find((entry) => entry.slug === "pricing");
      expect(secondEntry?.revisionId).toBe(firstEntry?.revisionId);
      expect(secondEntry?.revision.hash).toBe(firstEntry?.revision.hash);
      expect(await listReleases(teamId)).toHaveLength(2);
    });

    it("activating an older release rolls the public page back", async () => {
      const page = await createPage({ teamId, name: "Pricing" });
      await updatePage(teamId, page.pageId, { title: "V1" });
      await publishPage(teamId, page.pageId);
      const v1 = await getActiveRelease(teamId);
      await updatePage(teamId, page.pageId, { title: "V2" });
      await publishPage(teamId, page.pageId);

      expect((await getPublishedPageBySlug(teamId, "pricing"))?.title).toBe("V2");

      await activateRelease(testDb, v1!);

      expect((await getPublishedPageBySlug(teamId, "pricing"))?.title).toBe("V1");
      const view = await getPageByPageId(page.pageId);
      expect(view?.title).toBe("V1");
      expect(view?.draftTitle).toBe("V2");
      expect(view?.status).toBe("published_with_changes");
      const releases = await listReleases(teamId);
      expect(releases.find((release) => release.active)?.releaseId).toBe(v1!.releaseId);
    });

    it("deleting a published page removes it from the active release", async () => {
      const keep = await createPage({ teamId, name: "Keep" });
      const scratch = await createPage({ teamId, name: "Scratch" });
      await publishPage(teamId, keep.pageId);
      await publishPage(teamId, scratch.pageId);
      expect(await getPublishedPageBySlug(teamId, "scratch")).not.toBeNull();
      const before = await getActiveRelease(teamId);

      expect((await deletePage(teamId, scratch.pageId)).ok).toBe(true);

      const after = await getActiveRelease(teamId);
      expect(after!.id).not.toBe(before!.id);
      expect(after!.pages.map((entry) => entry.slug)).toEqual(["keep"]);
      expect(await getPublishedPageBySlug(teamId, "scratch")).toBeNull();
      expect(await getPublishedPageBySlug(teamId, "keep")).not.toBeNull();
    });

    it("changing a published page's slug moves it in the active release", async () => {
      const page = await createPage({ teamId, name: "Pricing" });
      await updatePage(teamId, page.pageId, { title: "Live" });
      await publishPage(teamId, page.pageId);
      // An unpublished draft edit must not be published by the move.
      await updatePage(teamId, page.pageId, { title: "Draft only" });

      const moved = await updatePage(teamId, page.pageId, { slug: "plans" });

      expect(moved?.slug).toBe("plans");
      expect(await getPublishedPageBySlug(teamId, "pricing")).toBeNull();
      const live = await getPublishedPageBySlug(teamId, "plans");
      expect(live?.title).toBe("Live");
      expect(live?.pageId).toBe(page.pageId);
      expect(moved?.status).toBe("published_with_changes");
    });

    it("rejects reserved slugs", async () => {
      const page = await createPage({ teamId, name: "Widget" });

      await expect(
        updatePage(teamId, page.pageId, { slug: "embed" }),
      ).rejects.toBeInstanceOf(InvalidSlugError);
      expect((await getPageByPageId(page.pageId))?.slug).toBe("widget");
    });
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

    it("promotes an external page social image without accepting its supplied metadata as verified library media", async () => {
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
      // Revision content is canonical: only url and alt are published.
      expect(published?.socialImage).toEqual({
        url: "https://medialit.example/card.png",
        alt: "Pricing Social Card",
      });

      const media = await listMedia({ teamId });
      const found = media.find((m) => m.url === "https://medialit.example/card.png");
      expect(found).toBeUndefined();
    });
  });
});
