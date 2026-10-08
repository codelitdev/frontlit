import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeTestDb, seedTeam, type TestDb } from "../test/db";
vi.mock("../db/client", async () => ({ db: await makeTestDb() }));
vi.mock("../media/service", () => ({
  getMedia: vi.fn(),
  mediaLitBindsSignedGroups: vi.fn(async () => true),
}));
import { db as appDb } from "../db/client";
import { eq } from "drizzle-orm";
import {
  documentationMemberships,
  documentationPublications,
  teamSettings,
  media,
} from "../db/schema";
import { getDocsSettings, saveDocumentation } from "./authoring";
import {
  queuePublication,
  documentationReadAllowed,
  processPublication,
  readDocumentation,
} from "./publications";
import { createDocSection } from "./queries";
import {
  getDocsUiSettings,
  getRetainedRevision,
  listDocumentRevisions,
  listPublicationHistory,
  previewDocumentation,
  retryDocumentationPublication,
  unpublishDocumentation,
} from "./experience";
const db = appDb as unknown as TestDb;
describe("D4 private editor lifecycle (DM-EDITOR/DELIVERY, V01,V06,V40)", () => {
  let teamId: string;
  beforeEach(async () => {
    teamId = (await seedTeam(db)).team.id;
  });
  async function doc(
    title = "Guide",
    slug = "guide",
    markdown = "## Setup\n\nPrivate draft",
  ) {
    return (await saveDocumentation(teamId, null, { title, slug, markdown }))!;
  }
  async function queue(row: any, includeSectionChanges = true) {
    const s = await getDocsSettings(teamId);
    return queuePublication(teamId, {
      selected: [
        { documentId: row.documentId, expectedDraftVersion: row.draftVersion },
      ],
      removals: [],
      expectedPublicationId: s.activePublicationId,
      expectedDocsDraftVersion: s.draftVersion,
      includeSectionChanges,
      idempotencyKey: crypto.randomUUID(),
    });
  }
  it("previews only an acknowledged own-team draft and omits tenant scripts/widgets", async () => {
    const row = await doc();
    await db.insert(teamSettings).values({
      teamId,
      codeInjectionHead: "<script>window.secret='leak'</script>",
      codeInjectionBody: "<script>alert(1)</script>",
    });
    const preview = await previewDocumentation(teamId, row.documentId, 1);
    expect(preview).toMatchObject({
      unpublished: true,
      draftVersion: 1,
      title: "Guide",
    });
    expect(JSON.stringify(preview)).not.toMatch(
      /window.secret|alert\(1\)|sharedWidgets|token/,
    );
    expect((await readDocumentation(teamId)).items).toEqual([]);
    await expect(previewDocumentation(teamId, row.documentId, 2)).rejects.toMatchObject(
      { diagnostics: [{ code: "STALE_DOCS_DRAFT" }] },
    );
    expect(
      await previewDocumentation((await seedTeam(db)).team.id, row.documentId, 1),
    ).toBeNull();
  });
  it("reads accepted retained history but refuses prepared candidates and public/foreign revision guesses", async () => {
    const row = await doc();
    const job = await queue(row);
    const member = await db.query.documentationMemberships.findFirst({
      where: eq(documentationMemberships.publicationId, job.publicationId),
    });
    expect(
      await getRetainedRevision(teamId, row.documentId, member!.revisionId),
    ).toBeNull();
    await processPublication(teamId, job.publicationId);
    expect(
      await getRetainedRevision(teamId, row.documentId, member!.revisionId),
    ).toMatchObject({
      title: "Guide",
      slug: "guide",
      excerpt: null,
      featuredImage: null,
      meta: { order: 0 },
      publicationId: job.publicationId,
    });
    expect(
      await getRetainedRevision(
        (await seedTeam(db)).team.id,
        row.documentId,
        member!.revisionId,
      ),
    ).toBeNull();
    expect((await listDocumentRevisions(teamId, row.documentId)).items).toHaveLength(1);
    const history = await listPublicationHistory(teamId, { limit: 1 });
    expect(history!.items).toHaveLength(1);
    expect(JSON.stringify(history)).not.toContain("Private draft");
    expect(
      await listPublicationHistory((await seedTeam(db)).team.id, {
        cursor: job.publicationId,
      }),
    ).toBeNull();
  });
  it("can copy an older accepted version into a draft without changing the live article", async () => {
    const first = await doc("First version");
    const firstPublication = await queue(first);
    await processPublication(teamId, firstPublication.publicationId);
    const second = await saveDocumentation(teamId, first.documentId, {
      expectedDraftVersion: first.draftVersion,
      title: "Second version",
      markdown: "## Updated\n\nNewer content",
    });
    const secondPublication = await queue(second);
    await processPublication(teamId, secondPublication.publicationId);

    const earlier = (await listDocumentRevisions(teamId, first.documentId)).items.find(
      (item) => item.title === "First version",
    )!;
    const version = (await getRetainedRevision(
      teamId,
      first.documentId,
      earlier.revisionId,
    ))!;
    const restored = await saveDocumentation(teamId, first.documentId, {
      expectedDraftVersion: second.draftVersion,
      title: version.title,
      slug: version.slug,
      content: version.content,
      excerpt: version.excerpt,
      featuredImage: version.featuredImage,
      meta: version.meta,
    });
    expect(restored?.draftTitle).toBe("First version");
    expect((await readDocumentation(teamId)).items[0].title).toBe("Second version");
  });
  it("hides documents referencing unavailable managed media from ordinary readers", async () => {
    const [asset] = await db
      .insert(media)
      .values({
        teamId,
        mediaLitId: "url-only",
        url: "https://media.example.test/file.png",
        access: "unavailable",
      })
      .returning();
    const row = {
      documentId: "draft",
      draftContent: {
        type: "doc",
        content: [{ type: "image", attrs: { src: asset.url } }],
      },
    };
    expect(await documentationReadAllowed(teamId, row, false)).toBe(false);
    expect(await documentationReadAllowed(teamId, row, true)).toBe(true);
    expect(
      await documentationReadAllowed((await seedTeam(db)).team.id, row, false),
    ).toBe(true);
  });
  it("paginates publications sharing a timestamp without skipping receipts", async () => {
    const row = await doc();
    const first = await queue(row);
    await processPublication(teamId, first.publicationId);
    const second = await queue(row);
    await db
      .update(documentationPublications)
      .set({ createdAt: new Date("2026-09-30T00:00:00Z") })
      .where(eq(documentationPublications.teamId, teamId));
    const page = (await listPublicationHistory(teamId, { limit: 1 }))!;
    expect(page.nextCursor).toBeTruthy();
    const next = (await listPublicationHistory(teamId, {
      limit: 1,
      cursor: page.nextCursor!,
    }))!;
    expect(new Set([page.items[0].publicationId, next.items[0].publicationId])).toEqual(
      new Set([first.publicationId, second.publicationId]),
    );
    expect(next.nextCursor).toBeNull();
  });
  it("unpublishes through validated removal while retaining the authoring draft", async () => {
    const row = await doc();
    const job = await queue(row);
    await processPublication(teamId, job.publicationId);
    const s = await getDocsSettings(teamId);
    const removal = await unpublishDocumentation(teamId, row.documentId, {
      expectedPublicationId: s.activePublicationId,
      expectedDocsDraftVersion: s.draftVersion,
      idempotencyKey: "unpublish",
    });
    expect((await readDocumentation(teamId)).items).toHaveLength(1);
    await processPublication(teamId, removal.publicationId);
    expect((await readDocumentation(teamId)).items).toHaveLength(0);
    expect(await previewDocumentation(teamId, row.documentId, 1)).toMatchObject({
      title: "Guide",
    });
  });
  it("retries exact immutable input idempotently without replacing it with newer drafts", async () => {
    const row = await doc();
    const job = await queue(row);
    await db
      .update(documentationPublications)
      .set({ status: "failed", finishedAt: new Date() })
      .where(eq(documentationPublications.publicationId, job.publicationId));
    await saveDocumentation(teamId, row.documentId, {
      expectedDraftVersion: 1,
      title: "Newer title",
    });
    const retry = (await retryDocumentationPublication(
      teamId,
      job.publicationId,
      "retry",
    ))!;
    expect(
      (await retryDocumentationPublication(teamId, job.publicationId, "retry"))!
        .publicationId,
    ).toBe(retry.publicationId);
    await processPublication(teamId, retry.publicationId);
    expect((await readDocumentation(teamId)).items[0].title).toBe("Guide");
    expect((await previewDocumentation(teamId, row.documentId, 2))!.title).toBe(
      "Newer title",
    );
  });
  it("makes pending navigation explicit and rejects a new Section excluded from publication", async () => {
    const row = await doc();
    const job = await queue(row);
    await processPublication(teamId, job.publicationId);
    const s = await getDocsSettings(teamId);
    const section = await createDocSection({
      teamId,
      name: "New section",
      expectedDocsDraftVersion: s.draftVersion,
    });
    const changed = await saveDocumentation(teamId, row.documentId, {
      expectedDraftVersion: 1,
      meta: { sectionId: section.sectionId },
    });
    expect((await getDocsUiSettings(teamId)).navigationPending).toBe(true);
    await expect(queue(changed, false)).rejects.toMatchObject({
      diagnostics: [{ code: "SECTION_NOT_PUBLISHED" }],
    });
    const capture = await queue(changed);
    await processPublication(teamId, capture.publicationId);
    expect((await getDocsUiSettings(teamId)).navigationPending).toBe(false);
  });
});
