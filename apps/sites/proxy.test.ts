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

  describe("embed host", () => {
    const embed = (path: string) =>
      proxy(
        new NextRequest(`http://embed.localhost:3002${path}`, {
          headers: { host: "embed.localhost:3002" },
        }),
      );

    it("serves the loader, settings and chat iframe without resolving a team", async () => {
      const loader = await embed("/chat.js");
      expect(new URL(loader.headers.get("x-middleware-rewrite")!).pathname).toBe(
        "/embed/chat.js",
      );
      const config = await embed("/tm_abc123/config");
      expect(new URL(config.headers.get("x-middleware-rewrite")!).pathname).toBe(
        "/embed/tm_abc123/config",
      );
      const chat = await embed("/tm_abc123/chat");
      expect(new URL(chat.headers.get("x-middleware-rewrite")!).pathname).toBe(
        "/embed/tm_abc123/chat",
      );
      expect(chat.headers.get("cache-control")).toBe("private, no-store");
      expect(api.resolveHost).not.toHaveBeenCalled();
    });

    it("serves nothing else", async () => {
      for (const path of [
        "/",
        "/docs",
        "/tm_abc123",
        "/tm_abc123/chat/x",
        "/embed/tm_abc123/chat",
      ]) {
        expect((await embed(path)).status).toBe(404);
      }
    });

    it("leaves the chat iframe off team hosts", async () => {
      (api.resolveHost as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        teamId: "tm_abc123",
        canonicalHost: "embedtest.localhost",
        redirect: false,
        hideFromSearch: false,
      });
      const response = await proxy(
        new NextRequest("http://embedtest.localhost:3002/embed/tm_abc123/chat", {
          headers: { host: "embedtest.localhost:3002" },
        }),
      );
      // Rewritten into the team's own site, where no such page exists.
      expect(new URL(response.headers.get("x-middleware-rewrite")!).pathname).toBe(
        "/sites/tm_abc123/embed/tm_abc123/chat",
      );
    });

    it("serves the static loader on every host", async () => {
      const response = await proxy(
        new NextRequest("http://any.localhost:3002/embed/chat.js", {
          headers: { host: "any.localhost:3002" },
        }),
      );
      expect(response.headers.get("x-middleware-next")).toBe("1");
      expect(api.resolveHost).not.toHaveBeenCalled();
    });
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

  describe("markdown for agents", () => {
    const resolve = (host: string) =>
      (
        api.resolveHost as unknown as {
          mockResolvedValueOnce: (val: unknown) => void;
        }
      ).mockResolvedValueOnce({
        teamId: "team_md",
        canonicalHost: host,
        redirect: false,
        hideFromSearch: false,
      });
    const rewrite = (response: Response) =>
      new URL(response.headers.get("x-middleware-rewrite")!);

    it("rewrites Accept: text/markdown to the Markdown route and varies on Accept", async () => {
      resolve("md1.localhost");
      const response = await proxy(
        new NextRequest("http://md1.localhost/docs/intro", {
          headers: { host: "md1.localhost", accept: "text/markdown" },
        }),
      );
      expect(rewrite(response).pathname).toBe(
        "/sites/team_md/agent-markdown/docs/intro",
      );
      expect(response.headers.get("vary")).toBe("Accept");
    });

    it("keeps browsers on HTML", async () => {
      resolve("md2.localhost");
      const response = await proxy(
        new NextRequest("http://md2.localhost/docs/intro", {
          headers: { host: "md2.localhost", accept: "text/html,*/*;q=0.8" },
        }),
      );
      expect(rewrite(response).pathname).toBe("/sites/team_md/docs/intro");
    });

    it("serves <path>.md as Markdown", async () => {
      resolve("md3.localhost");
      const response = await proxy(
        new NextRequest("http://md3.localhost/index.md", {
          headers: { host: "md3.localhost" },
        }),
      );
      expect(rewrite(response).pathname).toBe("/sites/team_md/agent-markdown");
      expect(rewrite(response).searchParams.get("md")).toBe("url");
      expect(response.headers.get("vary")).toBeNull();
    });
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
  it("ignores a forwarded protocol that is not a bare scheme", async () => {
    (
      api.resolveHost as unknown as {
        mockResolvedValueOnce: (val: unknown) => void;
      }
    ).mockResolvedValueOnce({
      teamId: "team_abc",
      canonicalHost: "sendlit.app",
      redirect: true,
      hideFromSearch: false,
    });
    // A host no other test has cached, so this mock is the one consumed.
    const request = new NextRequest("http://shop.sendlit.app/pricing", {
      headers: {
        host: "shop.sendlit.app",
        "x-forwarded-proto": "https://attacker.example/",
      },
    });
    const response = await proxy(request);
    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe("http://sendlit.app/pricing");
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
      // Nothing about the request is passed to the render: cached HTML
      // must not depend on the host it was first requested on.
      const forwarded = [...response.headers.keys()].filter((key) =>
        key.startsWith("x-middleware-request-"),
      );
      expect(forwarded).toEqual([]);
      return response.headers.get("x-robots-tag");
    }

    it("indexes the canonical host of a live site", async () => {
      expect(
        await visit("live.localhost", {
          canonicalHost: "live.localhost",
          hideFromSearch: false,
        }),
      ).toBeNull();
    });

    it("noindexes a subdomain kept serving next to a custom domain", async () => {
      expect(
        await visit("kept.localhost", {
          canonicalHost: "kept.example.com",
          hideFromSearch: false,
        }),
      ).toBe("noindex");
    });

    it("noindexes every host of a hidden site", async () => {
      expect(
        await visit("draft.localhost", {
          canonicalHost: "draft.localhost",
          hideFromSearch: true,
        }),
      ).toBe("noindex");
    });
  });
});
