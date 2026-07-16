import { beforeEach, describe, expect, it } from "vitest";
import { makeTestDb, seedTeam, truncateAll, type TestDb } from "./db";

describe("makeTestDb", () => {
    let db: TestDb;

    beforeEach(async () => {
        db = await makeTestDb();
    });

    it("applies real migrations so schema queries work", async () => {
        const { team } = await seedTeam(db, { name: "Acme" });
        expect(team.teamId).toMatch(/^team_/);
        expect(team.name).toBe("Acme");
    });

    it("truncateAll clears seeded rows", async () => {
        await seedTeam(db);
        await truncateAll(db);
        const rows = await db.query.teams.findMany();
        expect(rows).toHaveLength(0);
    });
});
