import { describe, expect, it, vi } from "vitest";
import { createHostCache, decideHost, normalizeHost } from "./host";

const url = { pathname: "/blog/hello", search: "?ref=x", protocol: "https:" };

describe("decideHost", () => {
    it("passes through an unknown host untouched", () => {
        expect(decideHost(null, url)).toEqual({ action: "unknown" });
    });

    it("rewrites either known host to the tenant segment", () => {
        const resolved = { teamId: "team_abc", canonicalHost: "acme.frontlit.app" };
        expect(decideHost(resolved, url)).toEqual({ action: "rewrite", teamId: "team_abc" });
    });

    it("normalizes ports and casing before cache/API lookup", () => {
        expect(normalizeHost("Acme.Localhost:3002")).toBe("acme.localhost");
    });
});

describe("createHostCache", () => {
    it("returns undefined (uncached) before a host is ever set", () => {
        const cache = createHostCache();
        expect(cache.get("acme.frontlit.app")).toBeUndefined();
    });

    it("returns the cached value, including a cached null (known-unknown host), before expiry", () => {
        const cache = createHostCache(60_000);
        cache.set("acme.frontlit.app", { teamId: "team_abc", canonicalHost: "acme.frontlit.app" });
        cache.set("nowhere.example", null);

        expect(cache.get("acme.frontlit.app")).toEqual({ teamId: "team_abc", canonicalHost: "acme.frontlit.app" });
        expect(cache.get("nowhere.example")).toBeNull();
    });

    it("expires entries after the TTL", () => {
        vi.useFakeTimers();
        try {
            const cache = createHostCache(1_000);
            cache.set("acme.frontlit.app", { teamId: "team_abc", canonicalHost: "acme.frontlit.app" });
            vi.advanceTimersByTime(1_001);
            expect(cache.get("acme.frontlit.app")).toBeUndefined();
        } finally {
            vi.useRealTimers();
        }
    });
});
