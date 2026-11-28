import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeTestDb, seedTeam, type TestDb } from "../test/db";

vi.mock("../db/client", async () => ({ db: await makeTestDb() }));

import { db as testDb } from "../db/client";
import {
  countPublishedDocuments,
  createDocument,
  deleteDocument,
  deriveDocumentStatus,
  discardDocumentDraft,
  getDocumentByDocumentId,
  getPublishedDocumentBySlug,
  listDocuments,
  listPublishedDocuments,
  publishDocument,
  updateDocument,
} from "./queries";
import { listMedia } from "../media/queries";
import { documents, media } from "../db/schema";
import { DocsContentError } from "@frontlit/text-editor/docs";
import { eq } from "drizzle-orm";

describe("documents engine (blog kind)", () => {
  const db = testDb as unknown as TestDb;
  let teamId: string;

  beforeEach(async () => {
    const seeded = await seedTeam(db);
    teamId = seeded.team.id;
  });

  it("creates a document with an empty draft and no published state", async () => {
    const doc = await createDocument("blog", {
      teamId,
      title: "Hello World",
    });

    expect(doc.slug).toBe("hello-world");
    expect(doc.publishedAt).toBeNull();
    expect(doc.draftTitle).toBe("Hello World");
    expect(doc.draftContent).toEqual({ type: "doc", content: [] });
    expect(doc.draftMeta).toEqual({});
    expect(deriveDocumentStatus(doc)).toBe("draft");
  });

  it("stores an excerpt given at creation for every document kind", async () => {
    for (const kind of ["blog", "changelog", "doc"] as const) {
      const doc = await createDocument(kind, {
        teamId,
        title: `With excerpt ${kind}`,
        excerpt: "Meta description",
      });
      expect(doc.draftExcerpt).toBe("Meta description");
    }
    const plain = await createDocument("blog", { teamId, title: "No excerpt" });
    expect(plain.draftExcerpt).toBeNull();
  });

  it("uniquifies slugs within a team and kind", async () => {
    const first = await createDocument("blog", { teamId, title: "Launch" });
    const second = await createDocument("blog", {
      teamId,
      title: "Launch",
    });
    const doc = await createDocument("doc", { teamId, title: "Launch" });

    expect(first.slug).toBe("launch");
    expect(second.slug).toBe("launch-2");
    // Different kind, same team: slug uniqueness is scoped per (team, kind).
    expect(doc.slug).toBe("launch");
  });

  it("normalizes an explicitly edited slug", async () => {
    const doc = await createDocument("doc", {
      teamId,
      title: "Getting Started",
    });

    const updated = await updateDocument("doc", teamId, doc.documentId, {
      expectedDraftVersion: 1,
      slug: "installation-guide",
    });

    expect((updated as any)?.draftSlug).toBe("installation-guide");
    expect(updated?.slug).toBe("getting-started");
  });

  it("saves duplicate documentation routes with publication blockers", async () => {
    const first = await createDocument("doc", { teamId, title: "First" });
    const second = await createDocument("doc", { teamId, title: "Second" });

    const saved = await updateDocument("doc", teamId, second.documentId, {
      expectedDraftVersion: 1,
      slug: first.slug,
    });
    expect((saved as any)?.publishable).toBe(false);
    expect(
      (saved as any)?.diagnostics.some((x: any) => x.code === "DUPLICATE_ROUTE"),
    ).toBe(true);
  });

  it("update writes only the draft columns, leaving published fields untouched", async () => {
    const created = await createDocument("blog", {
      teamId,
      title: "Draft post",
    });

    const updated = await updateDocument("blog", teamId, created.documentId, {
      content: { type: "doc", content: [{ type: "paragraph" }] },
      excerpt: "A short summary",
      meta: { tags: ["announcement"] },
    });

    expect(updated?.draftContent).toEqual({
      type: "doc",
      content: [{ type: "paragraph" }],
    });
    expect(updated?.draftExcerpt).toBe("A short summary");
    expect(updated?.draftMeta).toEqual({ tags: ["announcement"] });
    expect(updated?.content).toBeNull();
    expect(updated?.title).toBeNull();
    expect(deriveDocumentStatus(updated!)).toBe("draft");
  });

  it("meta patches shallow-merge instead of replacing the whole object", async () => {
    const created = await createDocument("blog", {
      teamId,
      title: "Post",
      meta: { tags: ["a"] },
    });
    const updated = await updateDocument("blog", teamId, created.documentId, {
      meta: { extra: true },
    });

    expect(updated?.draftMeta).toEqual({ tags: ["a"], extra: true });
  });

  it("publish copies draft fields into published fields and stamps publishedAt", async () => {
    const created = await createDocument("blog", { teamId, title: "Post" });
    await updateDocument("blog", teamId, created.documentId, {
      content: { type: "doc", content: [{ type: "paragraph" }] },
    });

    const published = await publishDocument("blog", teamId, created.documentId);

    expect(published?.publishedAt).not.toBeNull();
    expect(published?.title).toBe("Post");
    expect(published?.content).toEqual({
      type: "doc",
      content: [{ type: "paragraph" }],
    });
    expect(deriveDocumentStatus(published!)).toBe("published");
  });

  it("further draft edits after publish show published_with_changes", async () => {
    const created = await createDocument("blog", { teamId, title: "Post" });
    await publishDocument("blog", teamId, created.documentId);
    const edited = await updateDocument("blog", teamId, created.documentId, {
      title: "Updated title",
    });

    expect(deriveDocumentStatus(edited!)).toBe("published_with_changes");
  });

  it("discard-draft resets the draft back to the published state", async () => {
    const created = await createDocument("blog", { teamId, title: "V1" });
    await publishDocument("blog", teamId, created.documentId);
    await updateDocument("blog", teamId, created.documentId, {
      title: "V2 (unpublished)",
    });

    const discarded = await discardDocumentDraft("blog", teamId, created.documentId);

    expect(discarded?.draftTitle).toBe("V1");
    expect(deriveDocumentStatus(discarded!)).toBe("published");
  });

  it("discard-draft is a no-op for a document that was never published", async () => {
    const created = await createDocument("blog", {
      teamId,
      title: "Never published",
    });
    await updateDocument("blog", teamId, created.documentId, {
      title: "Edited",
    });

    const result = await discardDocumentDraft("blog", teamId, created.documentId);

    expect(result?.draftTitle).toBe("Edited");
  });

  it("update/publish/discard/delete are team-scoped and no-op for another team", async () => {
    const created = await createDocument("blog", { teamId, title: "Post" });
    const { team: otherTeam } = await seedTeam(db, { name: "Other" });

    expect(
      await updateDocument("blog", otherTeam.id, created.documentId, {
        title: "hijacked",
      }),
    ).toBeNull();
    expect(await publishDocument("blog", otherTeam.id, created.documentId)).toBeNull();
    expect(
      await discardDocumentDraft("blog", otherTeam.id, created.documentId),
    ).toBeNull();
    expect((await deleteDocument("blog", otherTeam.id, created.documentId)).ok).toBe(
      false,
    );

    const untouched = await getDocumentByDocumentId("blog", created.documentId);
    expect(untouched?.draftTitle).toBe("Post");
  });

  it("lists documents newest-first, scoped to team and kind", async () => {
    await createDocument("blog", { teamId, title: "Blog A" });
    await createDocument("blog", { teamId, title: "Blog B" });
    await createDocument("doc", { teamId, title: "Doc A" });

    const blogs = await listDocuments("blog", { teamId });
    expect(blogs).toHaveLength(2);
    expect(blogs.map((b) => b.draftTitle).sort()).toEqual(["Blog A", "Blog B"]);
  });

  it("deletes a document", async () => {
    const created = await createDocument("blog", {
      teamId,
      title: "Scratch",
    });
    const result = await deleteDocument("blog", teamId, created.documentId);

    expect(result.ok).toBe(true);
    expect(await getDocumentByDocumentId("blog", created.documentId)).toBeUndefined();
  });

  describe("public reads", () => {
    it("only ever return published documents", async () => {
      const draftOnly = await createDocument("blog", {
        teamId,
        title: "Unpublished",
      });
      const published = await createDocument("blog", {
        teamId,
        title: "Published post",
      });
      await publishDocument("blog", teamId, published.documentId);

      const items = await listPublishedDocuments("blog", { teamId });
      expect(items).toHaveLength(1);
      expect(items[0].documentId).toBe(published.documentId);
      expect(await countPublishedDocuments("blog", { teamId })).toBe(1);

      expect(
        await getPublishedDocumentBySlug("blog", teamId, draftOnly.slug),
      ).toBeUndefined();
      expect(
        await getPublishedDocumentBySlug("blog", teamId, published.slug),
      ).toMatchObject({
        documentId: published.documentId,
      });
    });
  });

  describe("featured images and media library reflection", () => {
    it("creates a document with an Unsplash image and never adds it to the media library", async () => {
      const doc = await createDocument("blog", {
        teamId,
        title: "Post with Unsplash Banner",
        featuredImage:
          "https://images.unsplash.com/photo-1579783902614-a3fb3927b675?auto=format",
      });

      expect(doc.draftFeaturedImage).toEqual({
        url: "https://images.unsplash.com/photo-1579783902614-a3fb3927b675?auto=format",
      });

      const mediaItems = await listMedia({ teamId });
      expect(mediaItems).toHaveLength(0);
    });

    it("creates a document with a plain external URL and does not add it to the media library", async () => {
      const doc = await createDocument("blog", {
        teamId,
        title: "Post with External Banner",
        featuredImage: "https://cdn.example.com/banner.jpg",
      });

      expect(doc.draftFeaturedImage).toEqual({
        url: "https://cdn.example.com/banner.jpg",
      });

      const mediaItems = await listMedia({ teamId });
      expect(mediaItems).toHaveLength(0);
    });

    async function seedMedia() {
      const [row] = await db
        .insert(media)
        .values({
          teamId,
          mediaLitId: `_VLxGal6${crypto.randomUUID()}`,
          url: "https://cdn.example.com/_VLxGal6abc.png",
          thumbnailUrl: "https://cdn.example.com/_VLxGal6abc_thumb.png",
          alt: "Library alt",
        })
        .returning();
      return row;
    }

    it("resolves a plain med_ id string from the team's media library", async () => {
      const item = await seedMedia();
      const doc = await createDocument("blog", {
        teamId,
        title: "Shorthand",
        featuredImage: item.mediaId,
      });

      expect(doc.draftFeaturedImage).toEqual({
        mediaId: item.mediaId,
        url: "https://cdn.example.com/_VLxGal6abc.png",
        thumbnailUrl: "https://cdn.example.com/_VLxGal6abc_thumb.png",
        alt: "Library alt",
      });
    });

    it("resolves an object with mediaId, takes url from the library, never derives mediaLitId", async () => {
      const item = await seedMedia();
      const created = await createDocument("blog", {
        teamId,
        title: "Draft Post",
      });

      const updated = await updateDocument("blog", teamId, created.documentId, {
        featuredImage: {
          mediaId: item.mediaId,
          url: "https://elsewhere.example.com/stale.png",
          alt: "Updated cover",
        },
      });

      expect(updated?.draftFeaturedImage).toEqual({
        mediaId: item.mediaId,
        url: "https://cdn.example.com/_VLxGal6abc.png",
        thumbnailUrl: "https://cdn.example.com/_VLxGal6abc_thumb.png",
        alt: "Updated cover",
      });
      expect(updated?.draftFeaturedImage).not.toHaveProperty("mediaLitId");

      const published = await publishDocument("blog", teamId, created.documentId);
      expect(published?.featuredImage).toEqual(updated?.draftFeaturedImage);
    });

    it("rejects a med_ id that is not in the team's media library", async () => {
      const otherTeam = await seedTeam(db);
      const foreign = await db
        .insert(media)
        .values({
          teamId: otherTeam.team.id,
          mediaLitId: `_foreign${crypto.randomUUID()}`,
          url: "https://cdn.example.com/foreign.png",
        })
        .returning();

      for (const featuredImage of [
        "med_doesnotexist",
        { mediaId: "med_doesnotexist" },
        foreign[0].mediaId,
      ]) {
        const error = await createDocument("blog", {
          teamId,
          title: "Bad id",
          featuredImage,
        }).catch((e) => e);
        expect(error).toBeInstanceOf(DocsContentError);
        expect(error.diagnostics[0]).toMatchObject({
          code: "MEDIA_NOT_FOUND",
          fieldPath: "featuredImage.mediaId",
        });
      }
    });

    it("rejects unknown featured image shapes instead of storing them", async () => {
      const created = await createDocument("blog", { teamId, title: "Shapes" });
      for (const featuredImage of [
        {
          mediaId: "med_x",
          url: "https://cdn.example.com/a.png",
          thumbnail: "x",
        },
        { mediaLitId: "_VLxGal6abc", url: "https://cdn.example.com/a.png" },
        { alt: "no image" },
        { mediaId: "_VLxGal6abc" },
        "not a url",
        42,
      ]) {
        const error = await updateDocument("blog", teamId, created.documentId, {
          featuredImage,
        }).catch((e) => e);
        expect(error).toBeInstanceOf(DocsContentError);
        expect(error.diagnostics[0].code).toBe("INVALID_FEATURED_IMAGE");
      }
      const unchanged = await getDocumentByDocumentId("blog", created.documentId);
      expect(unchanged?.draftFeaturedImage).toBeNull();
    });
  });
});

describe("documents engine (changelog kind)", () => {
  const db = testDb as unknown as TestDb;
  let teamId: string;

  beforeEach(async () => {
    teamId = (await seedTeam(db)).team.id;
  });

  async function publishedEntry(
    title: string,
    meta: Record<string, unknown>,
    publishedAt: string,
  ) {
    const created = await createDocument("changelog", { teamId, title, meta });
    await publishDocument("changelog", teamId, created.documentId);
    await db
      .update(documents)
      .set({ publishedAt: new Date(publishedAt) })
      .where(eq(documents.documentId, created.documentId));
    return created;
  }

  it("orders the public feed by release date, falling back to the publish date", async () => {
    await publishedEntry(
      "Old release",
      { releaseDate: "2026-01-10" },
      "2026-11-01T09:00:00Z",
    );
    await publishedEntry("No release date", {}, "2026-06-15T09:00:00Z");
    await publishedEntry(
      "New release",
      { releaseDate: "2026-09-01" },
      "2026-09-02T09:00:00Z",
    );

    const items = await listPublishedDocuments("changelog", {
      teamId,
      itemsPerPage: 10,
    });
    expect(items.map((item) => item.title)).toEqual([
      "New release",
      "No release date",
      "Old release",
    ]);
  });

  it("breaks release-date ties by publish time, newest first", async () => {
    await publishedEntry(
      "Morning",
      { releaseDate: "2026-09-01" },
      "2026-09-01T08:00:00Z",
    );
    await publishedEntry(
      "Evening",
      { releaseDate: "2026-09-01" },
      "2026-09-01T20:00:00Z",
    );

    const items = await listPublishedDocuments("changelog", {
      teamId,
      itemsPerPage: 10,
    });
    expect(items.map((item) => item.title)).toEqual(["Evening", "Morning"]);
  });

  it("ignores unpublished draft meta when ordering", async () => {
    const first = await publishedEntry(
      "First",
      { releaseDate: "2026-02-01" },
      "2026-02-01T00:00:00Z",
    );
    await publishedEntry(
      "Second",
      { releaseDate: "2026-03-01" },
      "2026-03-01T00:00:00Z",
    );
    // A draft-only date change must not move the published entry.
    await updateDocument("changelog", teamId, first.documentId, {
      meta: { releaseDate: "2026-12-31" },
    });

    const items = await listPublishedDocuments("changelog", {
      teamId,
      itemsPerPage: 10,
    });
    expect(items.map((item) => item.title)).toEqual(["Second", "First"]);
    expect(items[1].meta).toMatchObject({ releaseDate: "2026-02-01" });
  });
});
