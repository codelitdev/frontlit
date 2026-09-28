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

    expect(settings.title).toBeNull();
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
    expect(otherSettings.title).toBeNull();
  });
});
