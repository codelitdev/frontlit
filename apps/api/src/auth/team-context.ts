import {
  computeEffectivePermissions,
  type TeamPermission,
  type TeamSelectionError,
} from "@frontlit/api-contract";
import {
  findTeamById,
  getTeamByTeamId,
  getTeamMembership,
  listTeamsForAccount,
} from "../team/queries";

type Team = NonNullable<Awaited<ReturnType<typeof findTeamById>>>;
type Membership = NonNullable<Awaited<ReturnType<typeof getTeamMembership>>>;

export type TeamContext = {
  team: Team;
  membership: Membership | null;
  isOwner: boolean;
  permissions: TeamPermission[];
};

export type TeamResolution =
  | { ok: true; context: TeamContext }
  | { ok: false; status: 400 | 403 | 409; body: TeamSelectionError };

function fail(
  status: 400 | 403 | 409,
  error: TeamSelectionError["error"],
  error_description: string,
  teams?: TeamSelectionError["teams"],
): TeamResolution {
  return {
    ok: false,
    status,
    body: { error, error_description, ...(teams ? { teams } : {}) },
  };
}

function userContext(
  team: Team,
  membership: Membership,
  accountId: string,
): TeamContext {
  const isOwner = team.ownerAccountId === accountId;
  return {
    team,
    membership,
    isOwner,
    permissions: computeEffectivePermissions(membership.permissions ?? [], { isOwner }),
  };
}

/**
 * The one place a request's team is chosen. REST (header or path parameter)
 * and MCP (`teamId` tool argument) both call this, so every way into a team
 * runs the same live membership check.
 *
 * - API keys are bound to one team; naming another is `team_mismatch`.
 * - User credentials (sessions, account-wide OAuth tokens) may name any team
 *   they are currently a member of. With no team named, a sole membership is
 *   used; otherwise the caller must choose.
 *
 * `requestedTeamId` is always the public team ID.
 */
export async function resolveTeamContext(input: {
  authKind: "session" | "oauth" | "apikey";
  accountId?: string;
  apiKeyTeamId?: string;
  requestedTeamId?: string;
}): Promise<TeamResolution> {
  if (input.authKind === "apikey") {
    const team = input.apiKeyTeamId ? await findTeamById(input.apiKeyTeamId) : null;
    if (!team) return fail(403, "not_a_team_member", "This API key has no team.");
    if (input.requestedTeamId && input.requestedTeamId !== team.teamId) {
      return fail(403, "team_mismatch", "This API key belongs to a different team.");
    }
    return {
      ok: true,
      context: { team, membership: null, isOwner: false, permissions: [] },
    };
  }

  const accountId = input.accountId;
  if (!accountId) {
    return fail(403, "not_a_team_member", "You are not a member of this team.");
  }

  if (input.requestedTeamId) {
    const team = await getTeamByTeamId(input.requestedTeamId).catch(() => undefined);
    if (!team) {
      return fail(400, "invalid_team_id", "The provided team ID is not valid.");
    }
    const membership = await getTeamMembership(team.id, accountId);
    if (!membership) {
      return fail(403, "not_a_team_member", "You are not a member of this team.");
    }
    return { ok: true, context: userContext(team, membership, accountId) };
  }

  const teams = await listTeamsForAccount(accountId);
  if (teams.length === 0) {
    return fail(409, "no_team", "This account doesn't belong to any team yet.");
  }
  if (teams.length > 1) {
    return fail(
      409,
      "team_required",
      "This account belongs to multiple teams. Specify one by its team ID.",
      teams.map((t) => ({ teamId: t.teamId, name: t.name })),
    );
  }
  const membership = await getTeamMembership(teams[0].id, accountId);
  if (!membership) {
    return fail(403, "not_a_team_member", "You are not a member of this team.");
  }
  return { ok: true, context: userContext(teams[0], membership, accountId) };
}
