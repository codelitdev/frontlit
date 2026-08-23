import { afterEach, describe, expect, it, vi } from "vitest";
import {
    assertPlatformMailConfig,
    getPlatformMailConfig,
} from "./platform-mail-config";

describe("platform mail config", () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it("uses console mode when the platform team key is absent", () => {
        vi.stubEnv("SENDLIT_PLATFORM_TEAM_API_KEY", "");
        expect(getPlatformMailConfig().mode).toBe("console");
        expect(() => assertPlatformMailConfig()).not.toThrow();
    });

    it("uses SendLit mode when the platform team key is present", () => {
        vi.stubEnv("SENDLIT_API_URL", "https://sendlit.example");
        vi.stubEnv("SENDLIT_PLATFORM_TEAM_API_KEY", "sl_live_platform");
        expect(getPlatformMailConfig().mode).toBe("sendlit");
        expect(() => assertPlatformMailConfig()).not.toThrow();
    });

    it("requires the SendLit URL when the platform team key is present", () => {
        vi.stubEnv("SENDLIT_API_URL", "");
        vi.stubEnv("SENDLIT_PLATFORM_TEAM_API_KEY", "sl_live_platform");
        expect(() => assertPlatformMailConfig()).toThrow(/SENDLIT_API_URL/);
    });

    it("rejects an invalid request timeout", () => {
        vi.stubEnv("SENDLIT_PLATFORM_REQUEST_TIMEOUT_MS", "0");
        expect(() => getPlatformMailConfig()).toThrow(
            /SENDLIT_PLATFORM_REQUEST_TIMEOUT_MS/,
        );
    });
});
