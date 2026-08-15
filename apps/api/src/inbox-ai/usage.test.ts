import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeTestDb, seedTeam, type TestDb } from "../test/db";

vi.mock("../db/client", async () => ({ db: await makeTestDb() }));

import { db as testDb } from "../db/client";
import { chargeReservation, releaseReservation, reserveTokens } from "./usage";

describe("AI daily usage budget", () => {
    const db = testDb as unknown as TestDb;
    let teamId: string;

    beforeEach(async () => {
        const seeded = await seedTeam(db);
        teamId = seeded.team.id;
        vi.stubEnv("INBOX_AI_DAILY_TOKEN_BUDGET", "100");
    });

    it("rejects a reserve that would exceed the daily budget", async () => {
        expect(await reserveTokens(teamId, 80)).toBe(true);
        expect(await reserveTokens(teamId, 30)).toBe(false);
        expect(await reserveTokens(teamId, 20)).toBe(true);
    });

    it("charges used tokens and frees unused reservation", async () => {
        expect(await reserveTokens(teamId, 50)).toBe(true);
        await chargeReservation(teamId, 50, 10);
        expect(await reserveTokens(teamId, 90)).toBe(true);
        await releaseReservation(teamId, 90);
        expect(await reserveTokens(teamId, 90)).toBe(true);
    });
});
