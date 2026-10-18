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
    });
    const request = new NextRequest("http://www.sendlit.app/pricing?x=1", {
      headers: { host: "www.sendlit.app", "x-forwarded-proto": "https" },
    });
    const response = await proxy(request);
    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe("https://sendlit.app/pricing?x=1");
    expect(response.headers.get("cache-control")).toBe("public, max-age=3600");
  });
});
