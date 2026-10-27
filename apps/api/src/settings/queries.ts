import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { invalidateSiteCache, siteTags } from "../services/site-cache";
import { genId } from "../db/id";
import { canonicalizeSettings } from "@frontlit/page-builder/schema";
import {
  DEFAULT_SHARED_WIDGETS,
  teamSettings,
  teams,
  themes,
  type SharedWidgetsRow,
} from "../db/schema";

const systemThemeIds = new Set([
  "classic",
  "studio",
  "midnight",
  "editorial",
  "neobrutalism",
  "terminal",
]);

export class InvalidSiteThemeReferenceError extends Error {}

async function validateSiteThemeReference(
  teamId: string,
  themeId: string | null | undefined,
) {
  if (!themeId || systemThemeIds.has(themeId)) return;

  const theme = await db.query.themes.findFirst({
    where: and(eq(themes.teamId, teamId), eq(themes.themeId, themeId)),
  });
  if (!theme) throw new InvalidSiteThemeReferenceError("Theme not found");
}

/** Header and footer a new team starts with: links to its standard pages,
 * not FrontLit's sample navigation. The renderer fills any key left unset
 * from the block's FrontLit defaults, so every field that has sample
 * content is set explicitly here. Logo text stays unset so both blocks
 * follow the Branding site title. */
function createTeamSharedWidgets(teamName: string): SharedWidgetsRow {
  const link = (label: string, href: string) => ({ id: genId(), label, href });
  const { header, footer } = DEFAULT_SHARED_WIDGETS;
  return {
    header: {
      ...header,
      settings: canonicalizeSettings("header", {
        ...header.settings,
        links: [link("Docs", "/docs"), link("Blog", "/blog")],
        // Every team has a help desk, so this always works.
        ctaLabel: "Contact us",
        ctaHref: "/help",
      }),
    },
    footer: {
      ...footer,
      settings: canonicalizeSettings("footer", {
        ...footer.settings,
        columns: [
          {
            id: genId(),
            title: "Resources",
            links: [
              link("Blog", "/blog"),
              link("Help center", "/help"),
              link("Docs", "/docs"),
            ],
          },
          {
            id: genId(),
            title: "Legal",
            links: [link("Terms of use", "/terms"), link("Privacy policy", "/privacy")],
          },
        ],
        copyrightText: `© ${teamName}. All rights reserved.`,
      }),
    },
  };
}

export async function getTeamSettings(teamId: string) {
  const existing = await db.query.teamSettings.findFirst({
    where: eq(teamSettings.teamId, teamId),
  });
  if (existing) return existing;

  // Lazily created on first read, same convention as chatbot settings —
  // no dashboard visit needed before a team can query its own defaults.
  const team = await db.query.teams.findFirst({ where: eq(teams.id, teamId) });
  const sharedWidgets = team
    ? createTeamSharedWidgets(team.name)
    : DEFAULT_SHARED_WIDGETS;
  const [created] = await db
    .insert(teamSettings)
    .values({
      teamId,
      // Like CourseLit, a new site starts with the team name as its title.
      title: team?.name ?? null,
      // Do not rely on the Postgres column default — local DBs keep
      // the old SQL default until migrations are reset.
      draftSharedWidgets: sharedWidgets,
    })
    .returning();
  return created;
}

export async function updateTeamSettings(
  teamId: string,
  patch: Partial<{
    title: string | null;
    subtitle: string | null;
    logo: Record<string, unknown> | null;
    themeId: string | null;
    codeInjectionHead: string | null;
    codeInjectionBody: string | null;
  }>,
) {
  await validateSiteThemeReference(teamId, patch.themeId);
  const existing = await getTeamSettings(teamId);
  if (patch.title !== undefined && !patch.title?.trim()) {
    // A cleared title falls back to the team name, same as a new site.
    const team = await db.query.teams.findFirst({ where: eq(teams.id, teamId) });
    patch = { ...patch, title: team?.name ?? null };
  }
  const [updated] = await db
    .update(teamSettings)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(teamSettings.id, existing.id))
    .returning();
  await invalidateSiteCache(teamId, (publicTeamId) => [siteTags.shell(publicTeamId)]);
  return updated;
}
