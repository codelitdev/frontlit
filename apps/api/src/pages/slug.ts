import { and, eq, ne } from "drizzle-orm";
import { db } from "../db/client";
import { pages } from "../db/schema";
import { slugify, uniqueSlug } from "../utils/slug";

export { slugify };

/** Appends a short numeric suffix until the slug is unique within the
 * team, optionally excluding one page (for renames). */
export async function uniqueSlugForTeam(
  teamId: string,
  base: string,
  excludePageId?: string,
): Promise<string> {
  return uniqueSlug(base, (candidate) =>
    isSlugTakenForTeam(teamId, candidate, excludePageId),
  );
}

export async function isSlugTakenForTeam(
  teamId: string,
  slug: string,
  excludePageId?: string,
): Promise<boolean> {
  const conditions = [eq(pages.teamId, teamId), eq(pages.slug, slug)];
  if (excludePageId) conditions.push(ne(pages.id, excludePageId));
  const existing = await db.query.pages.findFirst({
    where: and(...conditions),
  });
  return Boolean(existing);
}
