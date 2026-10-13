import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeTestDb, seedTeam, type TestDb } from "../test/db";
vi.mock("../db/client", async () => ({ db: await makeTestDb() }));
vi.mock("./index-jobs", () => ({ enqueueDocumentIndex: vi.fn() }));
import { db as testDb } from "../db/client";
import { documents, documentationSettings } from "../db/schema";
import {
  saveDocumentation,
  validateDocumentation,
  changeDocumentation,
  DraftConflict,
  getDocsSettings,
  updateDocsSettings,
} from "./authoring";
import { eq } from "drizzle-orm";
const db = testDb as unknown as TestDb;
describe("D2 versioned authoring", () => {
  let teamId: string;
  beforeEach(async () => {
    teamId = (await seedTeam(db)).team.id;
  });
  const create = (title = "Example", slug?: string) =>
    saveDocumentation(teamId, null, { title, ...(slug ? { slug } : {}) });
  it("requires an expected version and rejects stale writes without changing any field", async () => {
    const doc = (await create())!;
    await expect(
      saveDocumentation(teamId, doc.documentId, { title: "Missing version" }),
    ).rejects.toThrow();
    const saved = (await saveDocumentation(teamId, doc.documentId, {
      title: "First",
      expectedDraftVersion: 1,
    }))!;
    expect(saved.draftVersion).toBe(2);
    await expect(
      saveDocumentation(teamId, doc.documentId, {
        title: "Stale",
        expectedDraftVersion: 1,
      }),
    ).rejects.toBeInstanceOf(DraftConflict);
    const row = await db.query.documents.findFirst({
      where: eq(documents.documentId, doc.documentId),
    });
    expect(row?.draftTitle).toBe("First");
    expect(row?.draftHash).toBe(saved.draftHash);
    expect(row?.draftVersion).toBe(2);
  });
  it("stores safe unpublishable drafts and stages slug changes", async () => {
    const doc = (await create())!;
    const saved = (await saveDocumentation(teamId, doc.documentId, {
      expectedDraftVersion: 1,
      title: "",
      slug: "setup/domain",
      markdown: "[Missing](/docs/missing#heading)",
    }))!;
    expect(saved.saved).toBe(true);
    expect(saved.publishable).toBe(false);
    expect(saved.slug).toBe("example");
    expect(saved.draftSlug).toBe("setup/domain");
    expect(saved.diagnostics.map((x: any) => x.code)).toEqual(
      expect.arrayContaining(["MISSING_TITLE", "BROKEN_LINK"]),
    );
    await expect(
      changeDocumentation(teamId, doc.documentId, 2, "publish"),
    ).rejects.toThrow();
  });
  it("allows duplicate draft routes and blocks publication", async () => {
    await create("First", "same");
    const doc = (await create("Second", "same"))!;
    expect(doc.publishable).toBe(false);
    expect(doc.diagnostics.some((x: any) => x.code === "DUPLICATE_ROUTE")).toBe(true);
  });
  it("validates full candidate links and anchors without writes", async () => {
    const doc = (await saveDocumentation(teamId, null, {
      title: "Example",
      markdown: "## Setup\n\n[Local](#setup)",
    }))!;
    const before = await getDocsSettings(teamId);
    const report = await validateDocumentation(teamId, {
      mode: "publication",
      selected: [{ documentId: doc.documentId, expectedDraftVersion: 1 }],
      removals: [],
    });
    expect(report?.publishable).toBe(true);
    expect(await getDocsSettings(teamId)).toEqual(before);
    expect(
      (
        await validateDocumentation(teamId, {
          mode: "document",
          documentId: doc.documentId,
          draft: { markdown: "[Local](#missing)" },
        })
      )?.diagnostics[0].code,
    ).toBe("BROKEN_ANCHOR");
  });
  it("rejects cross-team sections and unsafe serialization before writing", async () => {
    const doc = (await create())!;
    await expect(
      saveDocumentation(teamId, doc.documentId, {
        expectedDraftVersion: 1,
        meta: { sectionId: "sec_foreign" },
      }),
    ).rejects.toThrow();
    await expect(
      saveDocumentation(teamId, doc.documentId, {
        expectedDraftVersion: 1,
        markdown: "raw <script>alert(1)</script>",
      }),
    ).rejects.toThrow();
    expect(
      (
        await db.query.documents.findFirst({
          where: eq(documents.documentId, doc.documentId),
        })
      )?.draftVersion,
    ).toBe(1);
  });
  it("requires configured provenance for Git drafts and never permits database-only Git publication", async () => {
    const doc = (await create())!;
    await db
      .update(documentationSettings)
      .set({ source: "git" })
      .where(eq(documentationSettings.teamId, teamId));
    await expect(
      saveDocumentation(teamId, doc.documentId, {
        expectedDraftVersion: 1,
        title: "Wrong",
      }),
    ).rejects.toThrow();
    await expect(
      changeDocumentation(teamId, doc.documentId, 1, "publish"),
    ).rejects.toThrow();
  });
  it("versions settings and restores published content as a new draft", async () => {
    const doc = (await create())!;
    await changeDocumentation(teamId, doc.documentId, 1, "publish");
    const edit = (await saveDocumentation(teamId, doc.documentId, {
      expectedDraftVersion: 1,
      title: "Edit",
      slug: "edit",
    }))!;
    const restored = (await changeDocumentation(
      teamId,
      doc.documentId,
      edit.draftVersion,
      "discard",
    ))!;
    expect(restored.draftVersion).toBe(3);
    expect(restored).toMatchObject({ source: "editor" });
    expect(restored.draftSlug).toBe("example");
    expect(restored.draftTitle).toBe("Example");
    const settings = await getDocsSettings(teamId);
    await updateDocsSettings(teamId, {
      expectedDocsDraftVersion: settings.draftVersion,
      indexing: { enabled: false },
    });
    await expect(
      updateDocsSettings(teamId, {
        expectedDocsDraftVersion: settings.draftVersion,
        indexing: { enabled: true },
      }),
    ).rejects.toBeInstanceOf(DraftConflict);
  });
});
