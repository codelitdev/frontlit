import { describe, expect, it, vi } from "vitest";
import {
  createHostCache,
  decideHost,
  hostCache,
  invalidateCachedHosts,
  lookupHost,
  normalizeHost,
} from "./host";

const url = {
  pathname: "/blog/hello",
  search: "?ref=x",
  protocol: "https:",
  port: "",
};

describe("decideHost", () => {
  it("passes through an unknown host untouched", () => {
    expect(decideHost(null, url)).toEqual({ action: "unknown" });
  });

  it("rewrites a serving host to the tenant segment", () => {
    const resolved = {
      teamId: "team_abc",
      canonicalHost: "acme.frontlit.app",
      redirect: false,
      hideFromSearch: false,
    };
    expect(decideHost(resolved, url)).toEqual({
      action: "rewrite",
      teamId: "team_abc",
    });
  });

  it("redirects a non-canonical host keeping path and query", () => {
    const resolved = {
      teamId: "team_abc",
      canonicalHost: "sendlit.app",
      redirect: true,
      hideFromSearch: false,
    };
    expect(
      decideHost(resolved, { ...url, pathname: "/pricing", search: "?x=1" }),
    ).toEqual({ action: "redirect", location: "https://sendlit.app/pricing?x=1" });
  });

  it("keeps the request scheme and port on local redirects", () => {
    const resolved = {
      teamId: "team_abc",
      canonicalHost: "example.test",
      redirect: true,
      hideFromSearch: false,
    };
    expect(decideHost(resolved, { ...url, protocol: "http:", port: "3002" })).toEqual({
      action: "redirect",
      location: "http://example.test:3002/blog/hello?ref=x",
    });
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
    cache.set("acme.frontlit.app", {
      teamId: "team_abc",
      canonicalHost: "acme.frontlit.app",
      redirect: false,
      hideFromSearch: false,
    });
    cache.set("nowhere.example", null);

    expect(cache.get("acme.frontlit.app")).toEqual({
      teamId: "team_abc",
      canonicalHost: "acme.frontlit.app",
      redirect: false,
      hideFromSearch: false,
    });
    expect(cache.get("nowhere.example")).toBeNull();
  });

  it("expires entries after the TTL", () => {
    vi.useFakeTimers();
    try {
      const cache = createHostCache(1_000);
      cache.set("acme.frontlit.app", {
        teamId: "team_abc",
        canonicalHost: "acme.frontlit.app",
        redirect: false,
        hideFromSearch: false,
      });
      vi.advanceTimersByTime(1_001);
      expect(cache.get("acme.frontlit.app")).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("deletes listed hosts from the same process-wide cache the proxy uses", async () => {
    hostCache.set("acme.localhost", {
      teamId: "team_abc",
      canonicalHost: "www.example.com",
      redirect: false,
      hideFromSearch: false,
    });
    hostCache.set("www.example.com", {
      teamId: "team_abc",
      canonicalHost: "www.example.com",
      redirect: false,
      hideFromSearch: false,
    });
    await invalidateCachedHosts(["Acme.Localhost:3002", "www.example.com"]);
    expect(hostCache.get("acme.localhost")).toBeUndefined();
    expect(hostCache.get("www.example.com")).toBeUndefined();
  });

  it("shares one cache across separately loaded copies of the module", async () => {
    // Next.js gives the proxy and the webhook route their own module copies.
    vi.resetModules();
    const other = await import("./host");
    expect(other.hostCache).toBe(hostCache);
    hostCache.set("acme.localhost", null);
    await other.invalidateCachedHosts(["acme.localhost"]);
    expect(hostCache.get("acme.localhost")).toBeUndefined();
  });
});

describe("lookupHost", () => {
  const acme = {
    teamId: "team_abc",
    canonicalHost: "acme.frontlit.app",
    redirect: false,
    hideFromSearch: false,
  };

  it("shares one upstream call between concurrent misses and caches the answer", async () => {
    hostCache.delete("acme.frontlit.app");
    const resolve = vi.fn(async () => acme);
    const results = await Promise.all([
      lookupHost("acme.frontlit.app", resolve),
      lookupHost("acme.frontlit.app", resolve),
    ]);
    expect(results).toEqual([acme, acme]);
    expect(resolve).toHaveBeenCalledOnce();
    await lookupHost("acme.frontlit.app", resolve);
    expect(resolve).toHaveBeenCalledOnce();
  });

  it("does not cache a failed lookup", async () => {
    hostCache.delete("down.frontlit.app");
    await expect(
      lookupHost("down.frontlit.app", async () => {
        throw new Error("API down");
      }),
    ).rejects.toThrow("API down");
    expect(hostCache.get("down.frontlit.app")).toBeUndefined();
  });
});
