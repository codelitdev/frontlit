import { describe, expect, it, vi } from "vitest";
import { createHostCache, decideHost } from "./host";

const url = { pathname: "/blog/hello", search: "?ref=x", protocol: "https:" };

describe("decideHost", () => {
    it("passes through an unknown host untouched", () => {
        expect(decideHost(null, url)).toEqual({ action: "unknown" });
    });

    it("rewrites to the tenant segment when the host is already primary", () => {
        const resolved = { teamId: "team_abc", isPrimary: true, primaryHost: "acme.frontlit.app" };
        expect(decideHost(resolved, url)).toEqual({ action: "rewrite", teamId: "team_abc" });
    });

    it("308s to the primary host, preserving path and query, when the host isn't primary", () => {
        const resolved = { teamId: "team_abc", isPrimary: false, primaryHost: "acme.com" };
        expect(decideHost(resolved, url)).toEqual({ action: "redirect", url: "https://acme.com/blog/hello?ref=x" });
    });
});

describe("createHostCache", () => {
    it("returns undefined (uncached) before a host is ever set", () => {
        const cache = createHostCache();
        expect(cache.get("acme.frontlit.app")).toBeUndefined();
    });

    it("returns the cached value, including a cached null (known-unknown host), before expiry", () => {
        const cache = createHostCache(60_000);
        cache.set("acme.frontlit.app", { teamId: "team_abc", isPrimary: true, primaryHost: "acme.frontlit.app" });
        cache.set("nowhere.example", null);

        expect(cache.get("acme.frontlit.app")).toEqual({ teamId: "team_abc", isPrimary: true, primaryHost: "acme.frontlit.app" });
        expect(cache.get("nowhere.example")).toBeNull();
    });

    it("expires entries after the TTL", () => {
        vi.useFakeTimers();
        try {
            const cache = createHostCache(1_000);
            cache.set("acme.frontlit.app", { teamId: "team_abc", isPrimary: true, primaryHost: "acme.frontlit.app" });
            vi.advanceTimersByTime(1_001);
            expect(cache.get("acme.frontlit.app")).toBeUndefined();
        } finally {
            vi.useRealTimers();
        }
    });
});
