import "dotenv/config";
import { describe, expect, it } from "vitest";
import { getMediaUploadSignature } from "./service";

/**
 * Exercises the real MediaLit HTTP API (the live instance configured via
 * MEDIALIT_APIKEY/MEDIALIT_SERVER in .env), unlike queries.test.ts which
 * mocks this module. Skipped automatically when those env vars aren't set
 * (e.g. CI without MediaLit credentials) so the suite stays green without
 * a network dependency.
 */
const hasCredentials = Boolean(
    process.env.MEDIALIT_APIKEY && process.env.MEDIALIT_SERVER,
);

describe.skipIf(!hasCredentials)("MediaLit service (live)", () => {
    it("obtains a real upload signature scoped to a group", async () => {
        const { signature, endpoint } = await getMediaUploadSignature(
            "integration-test-team",
        );

        expect(typeof signature).toBe("string");
        expect(signature.length).toBeGreaterThan(0);
        expect(endpoint).toBe(process.env.MEDIALIT_SERVER);
    });
});
