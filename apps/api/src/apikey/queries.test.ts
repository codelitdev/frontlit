import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeTestDb, seedTeam, type TestDb } from "../test/db";

vi.mock("../db/client", async () => ({ db: await makeTestDb() }));

import { db as testDb } from "../db/client";
import {
    createApiKey,
    deleteApiKey,
    getApiKeyBySecret,
    getApiKeysByTeamId,
} from "./queries";
import { hashApiKey } from "./secret";

describe("API keys", () => {
    const db = testDb as unknown as TestDb;
    let teamId: string;
    let otherTeamId: string;

    beforeEach(async () => {
        const seeded = await seedTeam(db);
        const other = await seedTeam(db, { name: "Other team" });
        teamId = seeded.team.id;
        otherTeamId = other.team.id;
    });

    it("creates a key once, lists it without the secret, and looks it up by secret hash", async () => {
        const { apiKey, secret } = await createApiKey(teamId, "CI bot");
        expect(secret.startsWith("fl_live_")).toBe(true);
        expect(apiKey.keyHash).toBe(hashApiKey(secret));
        expect(apiKey.keyPrefix).toBe(secret.slice(0, "fl_live_".length + 6));
        expect(apiKey.name).toBe("CI bot");
        expect(apiKey.teamId).toBe(teamId);

        const listed = await getApiKeysByTeamId(teamId);
        expect(listed).toHaveLength(1);
        expect(listed[0].id).toBe(apiKey.id);
        // Secret is never persisted or returned from list.
        expect((listed[0] as { secret?: string }).secret).toBeUndefined();
        expect(listed[0].keyHash).toBe(apiKey.keyHash);

        expect(await getApiKeyBySecret(secret)).toMatchObject({
            id: apiKey.id,
            teamId,
            name: "CI bot",
        });
        expect(await getApiKeyBySecret("fl_live_not-a-real-key")).toBeNull();
    });

    it("scopes listing and deletion to the owning team", async () => {
        const { apiKey, secret } = await createApiKey(teamId, "Owner key");
        const other = await createApiKey(otherTeamId, "Other key");

        expect(await getApiKeysByTeamId(teamId)).toHaveLength(1);
        expect(await getApiKeysByTeamId(otherTeamId)).toHaveLength(1);

        // Deleting with the wrong team must not remove the key.
        await deleteApiKey(otherTeamId, apiKey.id);
        expect(await getApiKeyBySecret(secret)).toMatchObject({
            id: apiKey.id,
        });

        await deleteApiKey(teamId, apiKey.id);
        expect(await getApiKeyBySecret(secret)).toBeNull();
        expect(await getApiKeysByTeamId(teamId)).toEqual([]);
        // Sibling team's key is untouched.
        expect(await getApiKeyBySecret(other.secret)).toMatchObject({
            id: other.apiKey.id,
        });
    });
});
