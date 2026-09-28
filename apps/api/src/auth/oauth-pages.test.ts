import type { AddressInfo } from "node:net";
import express from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSession, listTeamsForUser, getSelectedTeamId, setSelectedTeamId } =
  vi.hoisted(() => ({
    getSession: vi.fn(async () => null as any),
    listTeamsForUser: vi.fn(async () => [] as any[]),
    getSelectedTeamId: vi.fn(async () => null as string | null),
    setSelectedTeamId: vi.fn(async () => {}),
  }));

vi.mock("./better-auth", () => ({
  webClientUrl: "http://localhost:3000",
  authBasePath: "/api/auth",
  hostedLoginMethods: [{ type: "email-otp" }],
  auth: { api: { getSession } },
  oauthTeamSelectionAdapter: {
    listTeamsForUser,
    getSelectedTeamId,
    setSelectedTeamId,
  },
}));
vi.mock("better-auth/node", () => ({
  fromNodeHeaders: (headers: unknown) => headers,
}));

import oauthPagesRoutes from "./oauth-pages.js";

describe("FrontLit OAuth pages", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    getSession.mockResolvedValue(null);
    listTeamsForUser.mockResolvedValue([]);
    getSelectedTeamId.mockResolvedValue(null);
    app = express();
    app.use(oauthPagesRoutes);
    app.use(
      (
        error: Error,
        _request: express.Request,
        response: express.Response,
        _next: express.NextFunction,
      ) => response.status(503).json({ error: error.message }),
    );
  });

  async function request(path: string, init: RequestInit = {}) {
    const server = app.listen(0, "127.0.0.1");
    try {
      await new Promise<void>((resolve) => server.once("listening", resolve));
      const { port } = server.address() as AddressInfo;
      const response = await fetch(`http://127.0.0.1:${port}${path}`, {
        redirect: "manual",
        ...init,
      });
      const body = await response.text();
      return {
        status: response.status,
        headers: response.headers,
        body,
        json: () => JSON.parse(body),
      };
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  }

  const session = {
    user: { id: "user-1", email: "owner@example.com" },
    session: { id: "session-1" },
  };
  const teamA = { id: "internal-a", publicId: "team_aaa", name: "Team A" };
  const teamB = { id: "internal-b", publicId: "team_bbb", name: "Team B" };

  it("mounts the shared hosted login with FrontLit configuration", async () => {
    const response = await request("/login?redirect=http://localhost:3000/pages/foo");
    expect(response.status).toBe(200);
    expect(response.body).toContain("Sign in to FrontLit");
    expect(response.body).toContain('var authBasePath="/api/auth"');
    expect(response.body).toContain("http://localhost:3000/pages/foo");
    expect(response.body).not.toContain("Continue with Google");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
  });

  it("routes unauthenticated team selection through OAuth login", async () => {
    const response = await request("/oauth/select-team?client_id=abc&scope=pages:read");
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "/oauth/login?client_id=abc&scope=pages:read",
    );
  });

  it("auto-continues for accounts that do not need a picker", async () => {
    getSession.mockResolvedValue(session);
    listTeamsForUser.mockResolvedValue([teamA]);
    const response = await request("/oauth/select-team?client_id=abc");
    expect(response.status).toBe(200);
    expect(response.body).toContain("/api/auth/oauth2/continue");
    expect(response.body).not.toContain('class="team-option"');
  });

  it("shows an actionable page instead of completing OAuth without a team", async () => {
    getSession.mockResolvedValue(session);
    listTeamsForUser.mockResolvedValue([]);
    const response = await request("/oauth/select-team?client_id=abc");
    expect(response.status).toBe(409);
    expect(response.body).toContain("Create or join a team");
    expect(response.body).toContain("http://localhost:3000/teams");
    expect(response.body).not.toContain("/api/auth/oauth2/continue");
  });

  it("renders only public team IDs and escapes team names", async () => {
    getSession.mockResolvedValue(session);
    listTeamsForUser.mockResolvedValue([{ ...teamA, name: "Team <A>" }, teamB]);
    const response = await request("/oauth/select-team?client_id=abc");
    expect(response.body).toContain(`value="${teamA.publicId}"`);
    expect(response.body).toContain(`value="${teamB.publicId}"`);
    expect(response.body).not.toContain(teamA.id);
    expect(response.body).toContain("Team &lt;A&gt;");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
  });

  it("validates and records a selected public team ID", async () => {
    getSession.mockResolvedValue(session);
    listTeamsForUser.mockResolvedValue([teamA, teamB]);
    const response = await request("/oauth/select-team", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ teamId: teamB.publicId }),
    });
    expect(response.status).toBe(200);
    expect(response.json()).toEqual({ ok: true });
    expect(setSelectedTeamId).toHaveBeenCalledWith("session-1", teamB.id);
  });

  it("forwards asynchronous team lookup failures to Express", async () => {
    getSession.mockResolvedValue(session);
    listTeamsForUser.mockRejectedValueOnce(new Error("database unavailable"));
    const response = await request("/oauth/select-team?client_id=abc");
    expect(response.status).toBe(503);
    expect(response.json()).toEqual({ error: "database unavailable" });
  });

  it.each([
    [null, {}, 401, "unauthorized"],
    [session, {}, 400, "invalid_request"],
    [session, { teamId: teamB.publicId }, 403, "not_a_team_member"],
  ])("rejects invalid team selection", async (activeSession, body, status, error) => {
    getSession.mockResolvedValue(activeSession);
    listTeamsForUser.mockResolvedValue([teamA]);
    const response = await request("/oauth/select-team", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    expect(response.status).toBe(status);
    expect(response.json()).toMatchObject({ error });
    expect(setSelectedTeamId).not.toHaveBeenCalled();
  });
});
