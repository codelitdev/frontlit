import { DocsContentError, diagnostic } from "@frontlit/text-editor/docs";
import { lockSettings, DraftConflict } from "./authoring";
import { withDbTransaction } from "../db/transaction";
import { and, count, eq } from "drizzle-orm";
import { db } from "../db/client";
import { docSections, documentationSettings } from "../db/schema";
import { slugify, uniqueSlug } from "../utils/slug";

// ---------------------------------------------------------------------------
// Doc sections (the help-center nav tree a "doc" document's meta.sectionId
// points into) \u2014 architecture.md §5.1.
// ---------------------------------------------------------------------------

async function sectionSlugTaken(teamId: string, slug: string): Promise<boolean> {
  const existing = await db.query.docSections.findFirst({
    where: and(eq(docSections.teamId, teamId), eq(docSections.slug, slug)),
  });
  return Boolean(existing);
}

export async function createDocSection(input: {
  teamId: string;
  name: string;
  order?: number;
  expectedDocsDraftVersion: number;
}) {
  return withDbTransaction(async (tx) => {
    const settings = await lockSettings(tx, input.teamId);
    if (settings.source !== "editor")
      throw new DocsContentError([
        diagnostic("SOURCE_REQUIRES_GIT", "This documentation area is owned by Git."),
      ]);
    if (settings.draftVersion !== input.expectedDocsDraftVersion)
      throw new DraftConflict(settings.draftVersion);
    const slug = await uniqueSlug(slugify(input.name), (candidate) =>
      sectionSlugTaken(input.teamId, candidate),
    );
    const [row] = await tx
      .insert(docSections)
      .values({ teamId: input.teamId, name: input.name, slug, order: input.order ?? 0 })
      .returning();
    await tx
      .update(documentationSettings)
      .set({ draftVersion: settings.draftVersion + 1 })
      .where(eq(documentationSettings.teamId, input.teamId));
    return row;
  });
}

export async function listDocSections(teamId: string) {
  return db.query.docSections.findMany({
    where: eq(docSections.teamId, teamId),
    orderBy: (row, { asc }) => asc(row.order),
  });
}

export async function getDocSectionBySectionId(teamId: string, sectionId: string) {
  return db.query.docSections.findFirst({
    where: and(eq(docSections.teamId, teamId), eq(docSections.sectionId, sectionId)),
  });
}

export async function updateDocSection(
  teamId: string,
  sectionId: string,
  patch: Partial<{ name: string; order: number }> & {
    expectedDocsDraftVersion: number;
  },
) {
  const existing = await getDocSectionBySectionId(teamId, sectionId);
  if (!existing) return null;
  return withDbTransaction(async (tx) => {
    const settings = await lockSettings(tx, teamId);
    if (settings.source !== "editor")
      throw new DocsContentError([
        diagnostic("SOURCE_REQUIRES_GIT", "This documentation area is owned by Git."),
      ]);
    if (settings.draftVersion !== patch.expectedDocsDraftVersion)
      throw new DraftConflict(settings.draftVersion);
    const { expectedDocsDraftVersion, ...fields } = patch;
    const [row] = await tx
      .update(docSections)
      .set({ ...fields, updatedAt: new Date() })
      .where(eq(docSections.id, existing.id))
      .returning();
    await tx
      .update(documentationSettings)
      .set({ draftVersion: settings.draftVersion + 1 })
      .where(eq(documentationSettings.teamId, teamId));
    return row;
  });
}
export async function deleteDocSection(
  teamId: string,
  sectionId: string,
  expectedDocsDraftVersion: number,
) {
  const existing = await getDocSectionBySectionId(teamId, sectionId);
  if (!existing) return { ok: false as const, reason: "not_found" as const };
  return withDbTransaction(async (tx) => {
    const settings = await lockSettings(tx, teamId);
    if (settings.source !== "editor")
      throw new DocsContentError([
        diagnostic("SOURCE_REQUIRES_GIT", "This documentation area is owned by Git."),
      ]);
    if (settings.draftVersion !== expectedDocsDraftVersion)
      throw new DraftConflict(settings.draftVersion);
    await tx.delete(docSections).where(eq(docSections.id, existing.id));
    await tx
      .update(documentationSettings)
      .set({ draftVersion: settings.draftVersion + 1 })
      .where(eq(documentationSettings.teamId, teamId));
    return { ok: true as const };
  });
}

export async function countDocSections(teamId: string) {
  const [{ value }] = await db
    .select({ value: count() })
    .from(docSections)
    .where(eq(docSections.teamId, teamId));
  return value;
}
