import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";
import * as api from "./lib/api";

vi.mock("./lib/api", () => ({
  resolveHost: vi.fn(),
}));

describe("proxy middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 404 for direct access to /sites paths", async () => {
    const request = new NextRequest("http://localhost:3002/sites/team_123/docs", {
      headers: { host: "localhost:3002" },
    });
    const response = await proxy(request);
    expect(response.status).toBe(404);
  });

  it("returns 404 for direct access to /sites root path", async () => {
    const request = new NextRequest("http://localhost:3002/sites", {
      headers: { host: "localhost:3002" },
    });
    const response = await proxy(request);
    expect(response.status).toBe(404);
  });

  it("returns 404 when host is unknown", async () => {
    const mockResolveHost = api.resolveHost as unknown as {
      mockResolvedValueOnce: (val: unknown) => void;
    };
    mockResolveHost.mockResolvedValueOnce(null);
    const request = new NextRequest("http://unknown.localhost:3002/docs/intro", {
      headers: { host: "unknown.localhost:3002" },
    });
    const response = await proxy(request);
    expect(response.status).toBe(404);
  });

  it("rewrites to /sites/[teamId]/... when host is resolved", async () => {
    const mockResolveHost = api.resolveHost as unknown as {
      mockResolvedValueOnce: (val: unknown) => void;
    };
    mockResolveHost.mockResolvedValueOnce({
      teamId: "team_hek5byq4ipm2xrixbr91nadi",
      canonicalHost: "nice.localhost",
      redirect: false,
      hideFromSearch: false,
    });
    const request = new NextRequest("http://nice.localhost:3002/docs/d2-smoke", {
      headers: { host: "nice.localhost:3002" },
    });
    const response = await proxy(request);
    expect(response.status).toBe(200);
    // In Next.js, NextResponse.rewrite sets the x-middleware-rewrite header
    const rewriteHeader = response.headers.get("x-middleware-rewrite");
    expect(rewriteHeader).toContain(
      "/sites/team_hek5byq4ipm2xrixbr91nadi/docs/d2-smoke",
    );
  });

  it("301-redirects a non-canonical host to the canonical host over the forwarded scheme", async () => {
    const mockResolveHost = api.resolveHost as unknown as {
      mockResolvedValueOnce: (val: unknown) => void;
    };
    mockResolveHost.mockResolvedValueOnce({
      teamId: "team_abc",
      canonicalHost: "sendlit.app",
      redirect: true,
      hideFromSearch: false,
    });
    const request = new NextRequest("http://www.sendlit.app/pricing?x=1", {
      headers: { host: "www.sendlit.app", "x-forwarded-proto": "https" },
    });
    const response = await proxy(request);
    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe("https://sendlit.app/pricing?x=1");
    expect(response.headers.get("cache-control")).toBe("public, max-age=3600");
  });
  describe("search visibility", () => {
    async function visit(host: string, resolved: Record<string, unknown>) {
      (
        api.resolveHost as unknown as {
          mockResolvedValueOnce: (val: unknown) => void;
        }
      ).mockResolvedValueOnce({ teamId: "team_abc", redirect: false, ...resolved });
      const response = await proxy(
        new NextRequest(`http://${host}:3002/`, { headers: { host: `${host}:3002` } }),
      );
      return {
        robotsTag: response.headers.get("x-robots-tag"),
        hidden: response.headers.get("x-middleware-request-x-frontlit-hidden"),
        noindex: response.headers.get("x-middleware-request-x-frontlit-noindex"),
      };
    }

    it("indexes the canonical host of a live site", async () => {
      expect(
        await visit("live.localhost", {
          canonicalHost: "live.localhost",
          hideFromSearch: false,
        }),
      ).toEqual({ robotsTag: null, hidden: "0", noindex: "0" });
    });

    it("noindexes a subdomain kept serving next to a custom domain", async () => {
      expect(
        await visit("kept.localhost", {
          canonicalHost: "kept.example.com",
          hideFromSearch: false,
        }),
      ).toEqual({ robotsTag: "noindex", hidden: "0", noindex: "1" });
    });

    it("noindexes every host of a hidden site", async () => {
      expect(
        await visit("draft.localhost", {
          canonicalHost: "draft.localhost",
          hideFromSearch: true,
        }),
      ).toEqual({ robotsTag: "noindex", hidden: "1", noindex: "1" });
    });
  });
});
