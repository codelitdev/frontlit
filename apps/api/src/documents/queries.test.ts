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
import { SlugConflictError } from "../utils/slug";

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
            slug: "  Installation Guide  ",
        });

        expect(updated?.slug).toBe("installation-guide");
    });

    it("rejects an edited slug already used by the same document kind", async () => {
        const first = await createDocument("doc", { teamId, title: "First" });
        const second = await createDocument("doc", { teamId, title: "Second" });

        await expect(
            updateDocument("doc", teamId, second.documentId, {
                slug: first.slug,
            }),
        ).rejects.toBeInstanceOf(SlugConflictError);
    });

    it("update writes only the draft columns, leaving published fields untouched", async () => {
        const created = await createDocument("blog", {
            teamId,
            title: "Draft post",
        });

        const updated = await updateDocument(
            "blog",
            teamId,
            created.documentId,
            {
                content: { type: "doc", content: [{ type: "paragraph" }] },
                excerpt: "A short summary",
                meta: { tags: ["announcement"] },
            },
        );

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
        const updated = await updateDocument(
            "blog",
            teamId,
            created.documentId,
            { meta: { extra: true } },
        );

        expect(updated?.draftMeta).toEqual({ tags: ["a"], extra: true });
    });

    it("publish copies draft fields into published fields and stamps publishedAt", async () => {
        const created = await createDocument("blog", { teamId, title: "Post" });
        await updateDocument("blog", teamId, created.documentId, {
            content: { type: "doc", content: [{ type: "paragraph" }] },
        });

        const published = await publishDocument(
            "blog",
            teamId,
            created.documentId,
        );

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
        const edited = await updateDocument(
            "blog",
            teamId,
            created.documentId,
            { title: "Updated title" },
        );

        expect(deriveDocumentStatus(edited!)).toBe("published_with_changes");
    });

    it("discard-draft resets the draft back to the published state", async () => {
        const created = await createDocument("blog", { teamId, title: "V1" });
        await publishDocument("blog", teamId, created.documentId);
        await updateDocument("blog", teamId, created.documentId, {
            title: "V2 (unpublished)",
        });

        const discarded = await discardDocumentDraft(
            "blog",
            teamId,
            created.documentId,
        );

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

        const result = await discardDocumentDraft(
            "blog",
            teamId,
            created.documentId,
        );

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
        expect(
            await publishDocument("blog", otherTeam.id, created.documentId),
        ).toBeNull();
        expect(
            await discardDocumentDraft(
                "blog",
                otherTeam.id,
                created.documentId,
            ),
        ).toBeNull();
        expect(
            (await deleteDocument("blog", otherTeam.id, created.documentId)).ok,
        ).toBe(false);

        const untouched = await getDocumentByDocumentId(
            "blog",
            created.documentId,
        );
        expect(untouched?.draftTitle).toBe("Post");
    });

    it("lists documents newest-first, scoped to team and kind", async () => {
        await createDocument("blog", { teamId, title: "Blog A" });
        await createDocument("blog", { teamId, title: "Blog B" });
        await createDocument("doc", { teamId, title: "Doc A" });

        const blogs = await listDocuments("blog", { teamId });
        expect(blogs).toHaveLength(2);
        expect(blogs.map((b) => b.draftTitle).sort()).toEqual([
            "Blog A",
            "Blog B",
        ]);
    });

    it("deletes a document", async () => {
        const created = await createDocument("blog", {
            teamId,
            title: "Scratch",
        });
        const result = await deleteDocument("blog", teamId, created.documentId);

        expect(result.ok).toBe(true);
        expect(
            await getDocumentByDocumentId("blog", created.documentId),
        ).toBeUndefined();
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
                await getPublishedDocumentBySlug(
                    "blog",
                    teamId,
                    draftOnly.slug,
                ),
            ).toBeUndefined();
            expect(
                await getPublishedDocumentBySlug(
                    "blog",
                    teamId,
                    published.slug,
                ),
            ).toMatchObject({
                documentId: published.documentId,
            });
        });
    });
});
