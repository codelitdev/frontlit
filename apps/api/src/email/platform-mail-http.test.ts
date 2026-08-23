import { afterEach, describe, expect, it, vi } from "vitest";
import { makeTestDb } from "../test/db";

vi.mock("../db/client", async () => ({ db: await makeTestDb() }));

import { listenApp } from "../test/auth-app";

import {
    getPlatformMailReadiness,
    resetPlatformMailStateForTests,
} from "./platform-mail";

describe("platform mail HTTP probes", () => {
    afterEach(() => {
        resetPlatformMailStateForTests();
        vi.unstubAllEnvs();
    });

    it("keeps /health independent of SendLit and /ready immediate in console mode", async () => {
        vi.stubEnv("SENDLIT_PLATFORM_TEAM_API_KEY", "");
        const listening = await listenApp();
        try {
            const health = await fetch(`${listening.origin}/health`);
            expect(health.status).toBe(200);
            await expect(health.json()).resolves.toMatchObject({
                status: "ok",
            });
            const ready = await fetch(`${listening.origin}/ready`);
            expect(ready.status).toBe(200);
            await expect(ready.json()).resolves.toEqual({ status: "ready" });
        } finally {
            await listening.close();
        }
    });

    it("returns 503 from /ready while SendLit mode is initializing", async () => {
        vi.stubEnv("SENDLIT_PLATFORM_TEAM_API_KEY", "sl_live_platform");
        resetPlatformMailStateForTests();
        expect(getPlatformMailReadiness().state).toBe("initializing");
        const listening = await listenApp();
        try {
            const health = await fetch(`${listening.origin}/health`);
            expect(health.status).toBe(200);
            const ready = await fetch(`${listening.origin}/ready`);
            expect(ready.status).toBe(503);
            await expect(ready.json()).resolves.toEqual({
                status: "initializing",
            });
        } finally {
            await listening.close();
        }
    });
});
