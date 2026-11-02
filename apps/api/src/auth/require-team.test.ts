import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveTeamContext: vi.fn(),
  loadTeamAuthz: vi.fn(async () => ({})),
}));
vi.mock("./team-context", () => ({ resolveTeamContext: mocks.resolveTeamContext }));
vi.mock("./authorize", () => ({ loadTeamAuthz: mocks.loadTeamAuthz }));

import { requireTeam } from "./require-team";

function response() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
  };
}

const context = {
  team: { id: "internal-1", teamId: "team_public_1" },
  membership: null,
  isOwner: false,
  permissions: [],
};

describe("requireTeam", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveTeamContext.mockResolvedValue({ ok: true, context });
  });

  it("resolves OAuth exactly like a session, from the team header", async () => {
    for (const authKind of ["oauth", "session"]) {
      const req = {
        authKind,
        accountId: "account-1",
        headers: { "x-frontlit-team-id": "team_public_1" },
      } as any;
      const next = vi.fn();
      await requireTeam(req, response() as any, next);
      expect(mocks.resolveTeamContext).toHaveBeenLastCalledWith({
        authKind,
        accountId: "account-1",
        apiKeyTeamId: undefined,
        requestedTeamId: "team_public_1",
      });
      expect(req.teamId).toBe("internal-1");
      expect(mocks.loadTeamAuthz).toHaveBeenLastCalledWith(req, "internal-1", context);
      expect(next).toHaveBeenCalledOnce();
    }
  });

  it("passes an API key's own team and any header to the resolver", async () => {
    const req = {
      authKind: "apikey",
      teamId: "internal-1",
      headers: { "x-frontlit-team-id": "team_other" },
    } as any;
    await requireTeam(req, response() as any, vi.fn());
    expect(mocks.resolveTeamContext).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKeyTeamId: "internal-1",
        requestedTeamId: "team_other",
      }),
    );
  });

  it("returns the resolver's error and stops", async () => {
    mocks.resolveTeamContext.mockResolvedValueOnce({
      ok: false,
      status: 409,
      body: { error: "team_required", error_description: "x", teams: [] },
    });
    const res = response();
    const next = vi.fn();
    await requireTeam(
      { authKind: "oauth", accountId: "account-1", headers: {} } as any,
      res as any,
      next,
    );
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "team_required" }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects a user credential without an account", async () => {
    const res = response();
    await requireTeam({ authKind: "oauth", headers: {} } as any, res as any, vi.fn());
    expect(res.status).toHaveBeenCalledWith(401);
    expect(mocks.resolveTeamContext).not.toHaveBeenCalled();
  });
});
