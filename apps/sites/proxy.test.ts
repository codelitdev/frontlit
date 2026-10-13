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
      canonicalHost: "nice.localhost:3002",
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
});
