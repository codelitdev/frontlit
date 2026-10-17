import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeTestDb, seedTeam, type TestDb } from "../test/db";

vi.mock("../db/client", async () => ({ db: await makeTestDb() }));

import { db as testDb } from "../db/client";
import { createTheme } from "../themes/queries";
import {
  getTeamSettings,
  InvalidSiteThemeReferenceError,
  updateTeamSettings,
} from "./queries";

describe("team settings", () => {
  const db = testDb as unknown as TestDb;
  let teamId: string;

  beforeEach(async () => {
    const seeded = await seedTeam(db);
    teamId = seeded.team.id;
  });

  it("lazily creates default settings on first read", async () => {
    const settings = await getTeamSettings(teamId);

    expect(settings.title).toBe("Test Team");
    expect(settings.codeInjectionHead).toBeNull();
    expect(settings.codeInjectionBody).toBeNull();
    expect(settings.themeId).toBeNull();
    expect(settings.sharedWidgets.header).toMatchObject({
      name: "header",
      shared: true,
      deletable: false,
      moveable: false,
      settings: { verticalPadding: "py-4" },
    });
    expect(settings.sharedWidgets.footer).toMatchObject({
      name: "footer",
      shared: true,
      deletable: false,
      moveable: false,
    });
    expect(settings.draftSharedWidgets).toEqual(settings.sharedWidgets);
  });

  it("starts with the team's own header and footer, not FrontLit's sample chrome", async () => {
    const { sharedWidgets } = await getTeamSettings(teamId);
    const headerSettings = sharedWidgets.header.settings as Record<string, unknown>;
    const footerSettings = sharedWidgets.footer.settings as Record<string, unknown>;

    // Logo text is left unset so header and footer follow Branding.
    expect(headerSettings.logoText).toBeUndefined();
    expect(headerSettings.ctaLabel).toBe("Contact us");
    expect(headerSettings.ctaHref).toBe("/help");
    expect(footerSettings.logoText).toBeUndefined();
    expect(footerSettings.copyrightText).toBe("© Test Team. All rights reserved.");
    expect(JSON.stringify(sharedWidgets)).not.toContain("FrontLit");
  });

  it("is idempotent — a second read returns the same row", async () => {
    const first = await getTeamSettings(teamId);
    const second = await getTeamSettings(teamId);
    expect(second.id).toBe(first.id);
  });

  it("updates branding and code-injection fields", async () => {
    const updated = await updateTeamSettings(teamId, {
      title: "Acme",
      subtitle: "The best widgets",
      codeInjectionHead: "<script>console.log('hi')</script>",
    });

    expect(updated.title).toBe("Acme");
    expect(updated.subtitle).toBe("The best widgets");
    expect(updated.codeInjectionHead).toContain("console.log");
    expect(updated.codeInjectionBody).toBeNull();
  });

  it("falls back to the team name when the title is cleared", async () => {
    await updateTeamSettings(teamId, { title: "Acme" });
    expect((await updateTeamSettings(teamId, { title: "" })).title).toBe("Test Team");
    expect((await updateTeamSettings(teamId, { title: null })).title).toBe("Test Team");
  });

  it("stores one system theme for the entire public site", async () => {
    const updated = await updateTeamSettings(teamId, {
      themeId: "midnight",
    });

    expect(updated.themeId).toBe("midnight");
    expect((await getTeamSettings(teamId)).themeId).toBe("midnight");
  });

  it("rejects a custom site theme owned by another team", async () => {
    const { team: other } = await seedTeam(db, { name: "Other" });
    const theme = await createTheme({
      teamId: other.id,
      name: "Private",
      style: { colors: {} },
    });

    await expect(
      updateTeamSettings(teamId, { themeId: theme.themeId }),
    ).rejects.toBeInstanceOf(InvalidSiteThemeReferenceError);
    expect((await getTeamSettings(teamId)).themeId).toBeNull();
  });

  it("updates are team-scoped", async () => {
    await updateTeamSettings(teamId, { title: "Acme" });
    const { team: other } = await seedTeam(db, { name: "Other" });

    const otherSettings = await getTeamSettings(other.id);
    expect(otherSettings.title).toBe("Other");
  });
});
