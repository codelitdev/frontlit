import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeTestDb, seedTeam, type TestDb } from "../test/db";

vi.mock("../db/client", async () => ({ db: await makeTestDb() }));

import { db as testDb } from "../db/client";
import {
    InboxAiPolicyError,
    getInboxAiPolicy,
    normalizeTopics,
    upsertInboxAiPolicy,
    validateTurnCap,
} from "./policy";

describe("inbox AI policy", () => {
    const db = testDb as unknown as TestDb;
    let teamId: string;

    beforeEach(async () => {
        const seeded = await seedTeam(db);
        teamId = seeded.team.id;
    });

    it("defaults to auto-reply off when no row exists", async () => {
        const policy = await getInboxAiPolicy(teamId, "chatbot");
        expect(policy.autoReply).toBe(false);
        expect(policy.escalateOnVisitorRequest).toBe(true);
        expect(policy.escalateTopics).toEqual([]);
    });

    it("upserts a channel and patches only supplied fields", async () => {
        await upsertInboxAiPolicy(teamId, "tickets", {
            autoReply: false,
            escalateTopics: ["Refund", "refund", "  Cancel "],
        });
        const updated = await upsertInboxAiPolicy(teamId, "tickets", {
            escalateWhenUnsure: false,
        });
        expect(updated.escalateTopics).toEqual(["refund", "cancel"]);
        expect(updated.escalateWhenUnsure).toBe(false);
        expect(updated.autoReply).toBe(false);
    });

    it("validates topics and turn cap", () => {
        expect(() => normalizeTopics([""])).toThrow(InboxAiPolicyError);
        expect(() => validateTurnCap(0)).toThrow(InboxAiPolicyError);
        expect(validateTurnCap(null)).toBeNull();
        expect(validateTurnCap(3)).toBe(3);
    });
});
