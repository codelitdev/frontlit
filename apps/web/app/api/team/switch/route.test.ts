import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/server-session", () => ({
  hasServerSession: vi.fn().mockResolvedValue(true),
}));

function request(fields: Record<string, string>, url?: string) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    form.set(key, value);
  }
  return new NextRequest(url ?? "http://localhost:3000/api/team/switch", {
    method: "POST",
    body: form,
  });
}

describe("POST /api/team/switch", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.doMock("@/lib/server-session", () => ({
      hasServerSession: vi.fn().mockResolvedValue(true),
    }));
  });

  it("uses a GET redirect after the form POST", async () => {
    const { POST } = await import("./route");
    const response = await POST(request({ teamId: "team_new", redirectTo: "/teams" }));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost:3000/teams");
    expect(response.cookies.get("frontlit_team_id")?.value).toBe("team_new");
  });

  it("redirects using WEB_CLIENT even when req.url is the container bind address", async () => {
    vi.stubEnv("WEB_CLIENT", "https://app.frontlit.cluster.clqa.site");
    vi.resetModules();
    vi.doMock("@/lib/server-session", () => ({
      hasServerSession: vi.fn().mockResolvedValue(true),
    }));
    const { POST } = await import("./route");
    const response = await POST(
      request(
        { teamId: "team_123", redirectTo: "/teams" },
        "http://0.0.0.0:3000/api/team/switch",
      ),
    );

    expect(response.headers.get("location")).toBe(
      "https://app.frontlit.cluster.clqa.site/teams",
    );
  });

  it.each(["https://attacker.example/steal", "//attacker.example/steal"])(
    "rejects an external redirect target: %s",
    async (redirectTo) => {
      const { POST } = await import("./route");
      const response = await POST(request({ teamId: "team_123", redirectTo }));

      expect(response.headers.get("location")).toBe("http://localhost:3000/");
    },
  );
});
