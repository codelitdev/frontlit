import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeTestDb, seedTeam, type TestDb } from "../test/db";

vi.mock("../db/client", async () => ({ db: await makeTestDb() }));

import { db as testDb } from "../db/client";
import { getChatbotSettings, updateChatbotSettings } from "./queries";

describe("chatbot settings", () => {
    const db = testDb as unknown as TestDb;
    let teamId: string;

    beforeEach(async () => {
        const seeded = await seedTeam(db);
        teamId = seeded.team.id;
    });

    it("lazily creates disabled defaults on first read", async () => {
        const settings = await getChatbotSettings(teamId);
        expect(settings.enabled).toBe(false);
        expect(settings.name).toBe("Assistant");
    });

    it("is idempotent: reading twice returns the same row", async () => {
        const first = await getChatbotSettings(teamId);
        const second = await getChatbotSettings(teamId);
        expect(second.id).toBe(first.id);
    });

    it("updates settings", async () => {
        const updated = await updateChatbotSettings(teamId, { enabled: true, name: "Helper", greeting: "Hi there!" });
        expect(updated.enabled).toBe(true);
        expect(updated.name).toBe("Helper");
        expect(updated.greeting).toBe("Hi there!");
    });
});
