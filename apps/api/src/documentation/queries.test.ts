import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeTestDb, seedTeam, type TestDb } from "../test/db";

vi.mock("../db/client", async () => ({ db: await makeTestDb() }));

import { eq } from "drizzle-orm";
import { db as testDb } from "../db/client";
import { documents } from "../db/schema";
import { createDocument, publishDocument } from "../documents/queries";
import {
    countDocSections,
    createDocSection,
    deleteChunksForDocument,
    deleteDocSection,
    getDocSectionBySectionId,
    listDocSections,
    reindexDocument,
    searchChunks,
    updateDocSection,
} from "./queries";

// Typed `any`: PGlite's drizzle instance and the app's own drizzle-orm
// import resolve to structurally-identical-but-nominally-distinct pg-core
// column types under pnpm's peer-dependency-keyed virtual store (a
// TS-only, compile-time quirk — vitest itself doesn't type-check, so this
// has no effect on what actually runs).
function testDbAny(db: TestDb): any {
    return db;
}

describe("documentation: reindexing on publish", () => {
    const db = testDbAny(testDb as unknown as TestDb);
    let teamId: string;

    beforeEach(async () => {
        const seeded = await seedTeam(db);
        teamId = seeded.team.id;
    });

    it("creates no chunks for a doc with empty content", async () => {
        const created = await createDocument("doc", { teamId, title: "Empty doc" });
        await publishDocument("doc", teamId, created.documentId);

        const chunks: any[] = await db.query.documentChunks.findMany({ where: (row: any, { eq }: any) => eq(row.documentId, created.id) });
        expect(chunks).toHaveLength(0);
    });

    it("chunks and embeds a published doc's content", async () => {
        const created = await createDocument("doc", { teamId, title: "Getting Started" });
        const content = {
            type: "doc" as const,
            content: [
                { type: "heading", content: [{ type: "text", text: "Installation" }] },
                { type: "paragraph", content: [{ type: "text", text: "Run npm install to get started with the CLI." }] },
            ],
        };

        const count = await reindexDocument({ teamId, documentId: created.id, content });

        expect(count).toBe(1);
        const chunks: any[] = await db.query.documentChunks.findMany({ where: (row: any, { eq }: any) => eq(row.documentId, created.id) });
        expect(chunks).toHaveLength(1);
        expect(chunks[0].heading).toBe("Installation");
        expect(chunks[0].anchor).toBe("installation");
        expect(chunks[0].embedding).toHaveLength(1536);
    });

    it("re-publishing replaces old chunks rather than accumulating them", async () => {
        const created = await createDocument("doc", { teamId, title: "Doc" });
        await reindexDocument({
            teamId,
            documentId: created.id,
            content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Version one of the content." }] }] },
        });
        await reindexDocument({
            teamId,
            documentId: created.id,
            content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Version two of the content." }] }] },
        });

        const chunks: any[] = await db.query.documentChunks.findMany({ where: (row: any, { eq }: any) => eq(row.documentId, created.id) });
        expect(chunks).toHaveLength(1);
        expect(chunks[0].content).toContain("Version two");
    });

    it("deleteChunksForDocument removes all of a document's chunks", async () => {
        const created = await createDocument("doc", { teamId, title: "Doc" });
        await reindexDocument({
            teamId,
            documentId: created.id,
            content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Some content here." }] }] },
        });

        await deleteChunksForDocument(created.id);

        const chunks: any[] = await db.query.documentChunks.findMany({ where: (row: any, { eq }: any) => eq(row.documentId, created.id) });
        expect(chunks).toHaveLength(0);
    });

    it("deleting the document cascades to its chunks", async () => {
        const created = await createDocument("doc", { teamId, title: "Doc" });
        await reindexDocument({
            teamId,
            documentId: created.id,
            content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Some content here." }] }] },
        });

        await db.delete(documents).where(eq(documents.id, created.id));

        const chunks: any[] = await db.query.documentChunks.findMany({ where: (row: any, { eq }: any) => eq(row.documentId, created.id) });
        expect(chunks).toHaveLength(0);
    });
});

describe("searchChunks", () => {
    const db = testDb as unknown as TestDb;
    let teamId: string;

    beforeEach(async () => {
        const seeded = await seedTeam(db);
        teamId = seeded.team.id;
    });

    it("finds a chunk by querying with its own exact text (perfect self-similarity)", async () => {
        const created = await createDocument("doc", { teamId, title: "Refunds" });
        await reindexDocument({
            teamId,
            documentId: created.id,
            content: {
                type: "doc",
                content: [
                    { type: "heading", content: [{ type: "text", text: "Refund policy" }] },
                    { type: "paragraph", content: [{ type: "text", text: "We offer a full refund within 30 days of purchase, no questions asked." }] },
                ],
            },
        });

        const results = await searchChunks(teamId, "We offer a full refund within 30 days of purchase, no questions asked.");

        expect(results.length).toBeGreaterThan(0);
        expect(results[0].documentId).toBe(created.documentId);
        expect(results[0].heading).toBe("Refund policy");
        expect(results[0].anchor).toBe("refund-policy");
        // Querying with the exact chunk text is cosine distance 0 → similarity 1.
        expect(results[0].similarity).toBeCloseTo(1, 5);
    });

    it("is scoped to the team — never returns another team's chunks", async () => {
        const created = await createDocument("doc", { teamId, title: "Doc" });
        await reindexDocument({
            teamId,
            documentId: created.id,
            content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Team-specific secret content." }] }] },
        });

        const { team: otherTeam } = await seedTeam(db, { name: "Other" });
        const results = await searchChunks(otherTeam.id, "Team-specific secret content.");

        expect(results).toHaveLength(0);
    });

    it("respects the k limit", async () => {
        const created = await createDocument("doc", { teamId, title: "Doc" });
        const paragraphs = Array.from({ length: 5 }, (_, i) => ({
            type: "heading",
            content: [{ type: "text", text: `Section ${i}` }],
        }));
        const content = {
            type: "doc" as const,
            content: paragraphs.flatMap((h, i) => [h, { type: "paragraph", content: [{ type: "text", text: `Content for section ${i} about widgets and gadgets.` }] }]),
        };
        await reindexDocument({ teamId, documentId: created.id, content });

        const results = await searchChunks(teamId, "widgets and gadgets", 2);
        expect(results.length).toBeLessThanOrEqual(2);
    });
});

describe("doc sections", () => {
    const db = testDb as unknown as TestDb;
    let teamId: string;

    beforeEach(async () => {
        const seeded = await seedTeam(db);
        teamId = seeded.team.id;
    });

    it("creates a section with a slug and default order", async () => {
        const section = await createDocSection({ teamId, name: "Getting Started" });
        expect(section.slug).toBe("getting-started");
        expect(section.order).toBe(0);
    });

    it("lists sections ordered by `order`", async () => {
        await createDocSection({ teamId, name: "Third", order: 3 });
        await createDocSection({ teamId, name: "First", order: 1 });
        await createDocSection({ teamId, name: "Second", order: 2 });

        const sections = await listDocSections(teamId);
        expect(sections.map((s) => s.name)).toEqual(["First", "Second", "Third"]);
        expect(await countDocSections(teamId)).toBe(3);
    });

    it("updates and deletes a section", async () => {
        const section = await createDocSection({ teamId, name: "Guides" });
        const updated = await updateDocSection(teamId, section.sectionId, { name: "User Guides", order: 5 });
        expect(updated?.name).toBe("User Guides");
        expect(updated?.order).toBe(5);

        const result = await deleteDocSection(teamId, section.sectionId);
        expect(result.ok).toBe(true);
        expect(await getDocSectionBySectionId(teamId, section.sectionId)).toBeUndefined();
    });

    it("update/delete are team-scoped", async () => {
        const section = await createDocSection({ teamId, name: "Guides" });
        const { team: otherTeam } = await seedTeam(db, { name: "Other" });

        expect(await updateDocSection(otherTeam.id, section.sectionId, { name: "hijacked" })).toBeNull();
        expect((await deleteDocSection(otherTeam.id, section.sectionId)).ok).toBe(false);
    });
});
