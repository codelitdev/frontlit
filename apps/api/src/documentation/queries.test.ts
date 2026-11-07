import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeTestDb, seedTeam, type TestDb } from "../test/db";

vi.mock("../db/client", async () => ({ db: await makeTestDb() }));

import { db as testDb } from "../db/client";
import {
  countDocSections,
  createDocSection,
  deleteDocSection,
  getDocSectionBySectionId,
  listDocSections,
  updateDocSection,
} from "./queries";

describe("doc sections", () => {
  const db = testDb as unknown as TestDb;
  let teamId: string;

  beforeEach(async () => {
    const seeded = await seedTeam(db);
    teamId = seeded.team.id;
  });

  it("creates a section with a slug and default order", async () => {
    const section = await createDocSection({
      teamId,
      expectedDocsDraftVersion: 1,
      name: "Getting Started",
    });
    expect(section.slug).toBe("getting-started");
    expect(section.order).toBe(0);
  });

  it("lists sections ordered by `order`", async () => {
    await createDocSection({
      teamId,
      name: "Third",
      order: 3,
      expectedDocsDraftVersion: 1,
    });
    await createDocSection({
      teamId,
      name: "First",
      order: 1,
      expectedDocsDraftVersion: 2,
    });
    await createDocSection({
      teamId,
      name: "Second",
      order: 2,
      expectedDocsDraftVersion: 3,
    });

    const sections = await listDocSections(teamId);
    expect(sections.map((s) => s.name)).toEqual(["First", "Second", "Third"]);
    expect(await countDocSections(teamId)).toBe(3);
  });

  it("updates and deletes a section", async () => {
    const section = await createDocSection({
      teamId,
      name: "Guides",
      expectedDocsDraftVersion: 1,
    });
    const updated = await updateDocSection(teamId, section.sectionId, {
      expectedDocsDraftVersion: 2,
      name: "User Guides",
      order: 5,
    });
    expect(updated?.name).toBe("User Guides");
    expect(updated?.order).toBe(5);

    const result = await deleteDocSection(teamId, section.sectionId, 3);
    expect(result.ok).toBe(true);
    expect(await getDocSectionBySectionId(teamId, section.sectionId)).toBeUndefined();
  });

  it("update/delete are team-scoped", async () => {
    const section = await createDocSection({
      teamId,
      name: "Guides",
      expectedDocsDraftVersion: 1,
    });
    const { team: otherTeam } = await seedTeam(db, { name: "Other" });

    expect(
      await updateDocSection(otherTeam.id, section.sectionId, {
        expectedDocsDraftVersion: 1,
        name: "hijacked",
      }),
    ).toBeNull();
    expect((await deleteDocSection(otherTeam.id, section.sectionId, 1)).ok).toBe(false);
  });
});
