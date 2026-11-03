import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findTeamById: vi.fn(),
  getTeamByTeamId: vi.fn(),
  getTeamMembership: vi.fn(),
  listTeamsForAccount: vi.fn(),
}));
vi.mock("../team/queries", () => mocks);

import { resolveTeamContext } from "./team-context";

const teamA = {
  id: "internal-a",
  teamId: "team_a",
  name: "A",
  ownerAccountId: "owner-1",
};
const teamB = {
  id: "internal-b",
  teamId: "team_b",
  name: "B",
  ownerAccountId: "account-1",
};
const membership = (teamId: string, permissions: string[] = []) => ({
  id: `m-${teamId}`,
  memberId: `tmem_${teamId}`,
  teamId,
  accountId: "account-1",
  permissions,
});

describe("resolveTeamContext", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.findTeamById.mockImplementation(async (id: string) =>
      [teamA, teamB].find((t) => t.id === id),
    );
    mocks.getTeamByTeamId.mockImplementation(async (id: string) =>
      [teamA, teamB].find((t) => t.teamId === id),
    );
  });

  it("resolves a named team with the user's permissions in it", async () => {
    mocks.getTeamMembership.mockResolvedValue(membership(teamA.id, ["pages:read"]));
    const result = await resolveTeamContext({
      authKind: "oauth",
      accountId: "account-1",
      requestedTeamId: "team_a",
    });
    expect(result).toMatchObject({
      ok: true,
      context: { team: { id: "internal-a" }, isOwner: false },
    });
    if (result.ok) expect(result.context.permissions).toContain("pages:read");
  });

  it("gives the owner every permission in their team", async () => {
    mocks.getTeamMembership.mockResolvedValue(membership(teamB.id));
    const result = await resolveTeamContext({
      authKind: "session",
      accountId: "account-1",
      requestedTeamId: "team_b",
    });
    expect(result).toMatchObject({ ok: true, context: { isOwner: true } });
    if (result.ok) expect(result.context.permissions).toContain("team:update");
  });

  it("rejects unknown teams and teams the user is not a member of", async () => {
    await expect(
      resolveTeamContext({
        authKind: "oauth",
        accountId: "account-1",
        requestedTeamId: "team_x",
      }),
    ).resolves.toMatchObject({
      ok: false,
      status: 400,
      body: { error: "invalid_team_id" },
    });

    mocks.getTeamMembership.mockResolvedValue(undefined);
    await expect(
      resolveTeamContext({
        authKind: "oauth",
        accountId: "account-1",
        requestedTeamId: "team_a",
      }),
    ).resolves.toMatchObject({
      ok: false,
      status: 403,
      body: { error: "not_a_team_member" },
    });
  });

  it("uses a sole team, and lists the choices when there are several", async () => {
    mocks.listTeamsForAccount.mockResolvedValueOnce([teamA]);
    mocks.getTeamMembership.mockResolvedValue(membership(teamA.id));
    await expect(
      resolveTeamContext({ authKind: "oauth", accountId: "account-1" }),
    ).resolves.toMatchObject({ ok: true, context: { team: { id: "internal-a" } } });

    mocks.listTeamsForAccount.mockResolvedValueOnce([teamA, teamB]);
    await expect(
      resolveTeamContext({ authKind: "oauth", accountId: "account-1" }),
    ).resolves.toMatchObject({
      ok: false,
      status: 409,
      body: {
        error: "team_required",
        teams: [
          { teamId: "team_a", name: "A" },
          { teamId: "team_b", name: "B" },
        ],
      },
    });

    mocks.listTeamsForAccount.mockResolvedValueOnce([]);
    await expect(
      resolveTeamContext({ authKind: "oauth", accountId: "account-1" }),
    ).resolves.toMatchObject({ ok: false, status: 409, body: { error: "no_team" } });
  });

  it("binds an API key to its own team", async () => {
    await expect(
      resolveTeamContext({ authKind: "apikey", apiKeyTeamId: "internal-a" }),
    ).resolves.toMatchObject({ ok: true, context: { team: { id: "internal-a" } } });
    await expect(
      resolveTeamContext({
        authKind: "apikey",
        apiKeyTeamId: "internal-a",
        requestedTeamId: "team_a",
      }),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      resolveTeamContext({
        authKind: "apikey",
        apiKeyTeamId: "internal-a",
        requestedTeamId: "team_b",
      }),
    ).resolves.toMatchObject({
      ok: false,
      status: 403,
      body: { error: "team_mismatch" },
    });
    expect(mocks.getTeamMembership).not.toHaveBeenCalled();
  });
});
