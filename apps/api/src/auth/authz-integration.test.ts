import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeTestDb, seedTeam, truncateAll, type TestDb } from "../test/db";
import { principalFromHeader, authHeaders, listenApp } from "../test/auth-app";

const sentInvites: Array<{ acceptUrl: string }> = [];

vi.mock("../db/client", async () => ({ db: await makeTestDb() }));
vi.mock("./resolve-auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./resolve-auth")>();
  return {
    ...actual,
    resolveAuth: async (input: { headers?: Record<string, unknown> }) => {
      const header = input.headers?.["x-test-principal"];
      const value = Array.isArray(header) ? header[0] : header;
      const result = principalFromHeader(typeof value === "string" ? value : undefined);
      if (result.status !== "authenticated" || result.kind !== "oauth") {
        return result;
      }
      const audiences = result.audiences.filter(Boolean);
      if (audiences.length > 0 && !audiences.includes("http://localhost:4000")) {
        return { status: "invalid_token" as const };
      }
      return result;
    },
  };
});
vi.mock("../team/invitation-email", () => ({
  InvitationDeliveryError: class extends Error {},
  sendInvitationEmail: async (input: { acceptUrl: string }) => {
    sentInvites.push(input);
  },
}));

import { and, eq } from "drizzle-orm";
import { db as testDb } from "../db/client";
import { accounts, teamMembers, teams } from "../db/schema";
import { createApiKey } from "../apikey/queries";
import { createPage } from "../pages/queries";
import { listAuditEventsByType } from "../team/audit";
import { GRANTABLE_NON_OWNER_PERMISSIONS } from "@frontlit/api-contract";

const db = testDb as unknown as TestDb;

async function seedMember(
  teamId: string,
  permissions: string[],
  email = `member-${crypto.randomUUID()}@example.com`,
) {
  const [account] = await db.insert(accounts).values({ email }).returning();
  await db.insert(teamMembers).values({
    teamId,
    accountId: account.id,
    role: "member",
    permissions,
  });
  return account;
}

describe("authorization integration", () => {
  beforeEach(async () => {
    sentInvites.length = 0;
    await truncateAll(db);
  });

  it("allows and denies session, OAuth, and API-key callers on real handlers", async () => {
    const { account: owner, team } = await seedTeam(db);
    const reader = await seedMember(team.id, ["pages:read"]);
    await createApiKey(team.id, "Integration");
    await createPage({ teamId: team.id, name: "Home" });
    const listening = await listenApp();
    try {
      const sessionOk = await fetch(`${listening.origin}/pages`, {
        headers: authHeaders(
          {
            kind: "session",
            accountId: owner.id,
            email: owner.email,
          },
          team.teamId,
        ),
      });
      expect(sessionOk.status).toBe(200);

      const memberTeams = await fetch(`${listening.origin}/teams`, {
        headers: authHeaders({
          kind: "session",
          accountId: reader.id,
          email: reader.email,
        }),
      });
      expect(memberTeams.status).toBe(200);
      await expect(memberTeams.json()).resolves.toMatchObject({
        items: [
          {
            teamId: team.teamId,
            isOwner: false,
            effectivePermissions: ["pages:read"],
          },
        ],
      });

      const sessionDenied = await fetch(`${listening.origin}/pages`, {
        method: "POST",
        headers: authHeaders(
          {
            kind: "session",
            accountId: reader.id,
            email: reader.email,
          },
          team.teamId,
        ),
        body: JSON.stringify({ name: "Nope" }),
      });
      expect(sessionDenied.status).toBe(403);
      await expect(sessionDenied.json()).resolves.toMatchObject({
        error: "insufficient_permission",
        permission: "pages:write",
      });

      const oauthAllowed = await fetch(`${listening.origin}/pages`, {
        headers: {
          ...authHeaders(
            {
              kind: "oauth",
              accountId: reader.id,
              email: reader.email,
              teamId: team.id,
              scopes: ["pages:read"],
              audiences: ["http://localhost:4000"],
            },
            team.teamId,
          ),
        },
      });
      expect(oauthAllowed.status).toBe(200);

      const oauthNoScope = await fetch(`${listening.origin}/pages`, {
        headers: authHeaders({
          kind: "oauth",
          accountId: owner.id,
          email: owner.email,
          teamId: team.id,
          scopes: ["themes:read"],
          audiences: ["http://localhost:4000"],
        }),
      });
      expect(oauthNoScope.status).toBe(403);
      await expect(oauthNoScope.json()).resolves.toMatchObject({
        error: "insufficient_scope",
        scope: "pages:read",
      });

      const oauthNoPermission = await fetch(`${listening.origin}/pages`, {
        method: "POST",
        headers: authHeaders({
          kind: "oauth",
          accountId: reader.id,
          email: reader.email,
          teamId: team.id,
          scopes: ["pages:write"],
          audiences: ["http://localhost:4000"],
        }),
        body: JSON.stringify({ name: "Nope" }),
      });
      expect(oauthNoPermission.status).toBe(403);
      await expect(oauthNoPermission.json()).resolves.toMatchObject({
        error: "insufficient_permission",
        permission: "pages:write",
      });

      const keyRes = await fetch(`${listening.origin}/pages`, {
        headers: authHeaders({
          kind: "apikey",
          teamId: team.id,
          apiKeyId: "key-1",
        }),
      });
      expect(keyRes.status).toBe(200);

      const oauthInvite = await fetch(
        `${listening.origin}/teams/${team.teamId}/invitations`,
        {
          method: "POST",
          headers: authHeaders({
            kind: "oauth",
            accountId: owner.id,
            email: owner.email,
            scopes: ["teams:write"],
            audiences: ["http://localhost:4000"],
          }),
          body: JSON.stringify({
            email: "oauth@example.com",
            permissions: ["pages:read"],
          }),
        },
      );
      expect(oauthInvite.status).toBe(403);
      await expect(oauthInvite.json()).resolves.toMatchObject({
        error: "unsupported_auth",
      });

      const keyCreate = await fetch(`${listening.origin}/teams/${team.teamId}/keys`, {
        method: "POST",
        headers: authHeaders({
          kind: "session",
          accountId: reader.id,
          email: reader.email,
        }),
        body: JSON.stringify({ name: "Escape" }),
      });
      expect(keyCreate.status).toBe(403);
      await expect(keyCreate.json()).resolves.toMatchObject({
        error: "owner_required",
      });

      const ownerKeyCreate = await fetch(
        `${listening.origin}/teams/${team.teamId}/keys`,
        {
          method: "POST",
          headers: authHeaders({
            kind: "session",
            accountId: owner.id,
            email: owner.email,
          }),
          body: JSON.stringify({ name: "Audited key" }),
        },
      );
      expect(ownerKeyCreate.status).toBe(201);
      expect(await listAuditEventsByType(team.teamId, "api_key.created")).toHaveLength(
        1,
      );

      const injection = await fetch(`${listening.origin}/settings`, {
        method: "PATCH",
        headers: authHeaders(
          {
            kind: "session",
            accountId: reader.id,
            email: reader.email,
          },
          team.teamId,
        ),
        body: JSON.stringify({ codeInjectionHead: "<script>" }),
      });
      expect(injection.status).toBe(403);
      await expect(injection.json()).resolves.toMatchObject({
        error: "owner_required",
      });

      const wrongAud = await fetch(`${listening.origin}/pages`, {
        headers: authHeaders({
          kind: "oauth",
          accountId: owner.id,
          email: owner.email,
          teamId: team.id,
          scopes: ["pages:read"],
          audiences: ["http://localhost:4000/mcp"],
        }),
      });
      expect(wrongAud.status).toBe(401);

      const other = await seedTeam(db, { name: "Other" });
      await db.insert(teamMembers).values({
        teamId: other.team.id,
        accountId: reader.id,
        role: "member",
        permissions: [...GRANTABLE_NON_OWNER_PERMISSIONS],
      });
      // One account-wide token works in every team the user belongs to,
      // limited to the user's permissions in each.
      const readerToken = {
        kind: "oauth" as const,
        accountId: reader.id,
        email: reader.email,
        scopes: ["teams:write", "pages:read"],
        audiences: ["http://localhost:4000"],
      };
      const renameOther = await fetch(
        `${listening.origin}/teams/${other.team.teamId}`,
        {
          method: "PATCH",
          headers: authHeaders(readerToken),
          body: JSON.stringify({ name: "Renamed by member" }),
        },
      );
      expect(renameOther.status).toBe(200);
      const renameOwn = await fetch(`${listening.origin}/teams/${team.teamId}`, {
        method: "PATCH",
        headers: authHeaders(readerToken),
        body: JSON.stringify({ name: "Not allowed" }),
      });
      expect(renameOwn.status).toBe(403);
      expect(
        await db.query.teams.findFirst({ where: eq(teams.id, team.id) }),
      ).not.toMatchObject({ name: "Not allowed" });

      const stranger = await seedTeam(db, { name: "Stranger" });
      const crossTeamMutation = await fetch(
        `${listening.origin}/teams/${stranger.team.teamId}`,
        {
          method: "PATCH",
          headers: authHeaders(readerToken),
          body: JSON.stringify({ name: "Cross-team rename" }),
        },
      );
      expect(crossTeamMutation.status).toBe(404);
      expect(
        await db.query.teams.findFirst({
          where: eq(teams.id, stranger.team.id),
        }),
      ).toMatchObject({ name: "Stranger" });

      const ambiguous = await fetch(`${listening.origin}/pages`, {
        headers: authHeaders(readerToken),
      });
      expect(ambiguous.status).toBe(409);
      const ambiguousBody = (await ambiguous.json()) as {
        error: string;
        teams: Array<{ teamId: string }>;
      };
      expect(ambiguousBody.error).toBe("team_required");
      expect(ambiguousBody.teams.map((t) => t.teamId).sort()).toEqual(
        [team.teamId, other.team.teamId].sort(),
      );

      const notMember = await fetch(`${listening.origin}/pages`, {
        headers: authHeaders(readerToken, stranger.team.teamId),
      });
      expect(notMember.status).toBe(403);
      await expect(notMember.json()).resolves.toMatchObject({
        error: "not_a_team_member",
      });

      await db
        .delete(teamMembers)
        .where(
          and(eq(teamMembers.teamId, team.id), eq(teamMembers.accountId, reader.id)),
        );
      const removed = await fetch(`${listening.origin}/pages`, {
        headers: authHeaders(readerToken, team.teamId),
      });
      expect(removed.status).toBe(403);
      await expect(removed.json()).resolves.toMatchObject({
        error: "not_a_team_member",
      });
      const stillMember = await fetch(`${listening.origin}/pages`, {
        headers: authHeaders(readerToken, other.team.teamId),
      });
      expect(stillMember.status).toBe(200);

      const keyMismatch = await fetch(`${listening.origin}/pages`, {
        headers: authHeaders(
          { kind: "apikey", teamId: team.id, apiKeyId: "key-1" },
          other.team.teamId,
        ),
      });
      expect(keyMismatch.status).toBe(403);
      await expect(keyMismatch.json()).resolves.toMatchObject({
        error: "team_mismatch",
      });
    } finally {
      await listening.close();
    }
  });

  it("enforces permission and membership changes on the next request", async () => {
    const { account: owner, team } = await seedTeam(db);
    const member = await seedMember(team.id, ["pages:read", "pages:write"]);
    const listening = await listenApp();
    try {
      const before = await fetch(`${listening.origin}/pages`, {
        method: "POST",
        headers: authHeaders({
          kind: "oauth",
          accountId: member.id,
          email: member.email,
          teamId: team.id,
          scopes: ["pages:write"],
          audiences: ["http://localhost:4000"],
        }),
        body: JSON.stringify({ name: "Draft" }),
      });
      expect(before.status).toBe(201);

      const roster = await fetch(`${listening.origin}/teams/${team.teamId}/members`, {
        headers: authHeaders({
          kind: "session",
          accountId: owner.id,
        }),
      });
      const { items } = (await roster.json()) as {
        items: Array<{
          memberId: string;
          email: string;
          version: number;
        }>;
      };
      const target = items.find((item) => item.email === member.email)!;
      await fetch(
        `${listening.origin}/teams/${team.teamId}/members/${target.memberId}`,
        {
          method: "PATCH",
          headers: authHeaders({
            kind: "session",
            accountId: owner.id,
          }),
          body: JSON.stringify({
            permissions: ["pages:read"],
            version: target.version,
          }),
        },
      );

      const afterPerm = await fetch(`${listening.origin}/pages`, {
        method: "POST",
        headers: authHeaders({
          kind: "oauth",
          accountId: member.id,
          email: member.email,
          teamId: team.id,
          scopes: ["pages:write"],
          audiences: ["http://localhost:4000"],
        }),
        body: JSON.stringify({ name: "Denied" }),
      });
      expect(afterPerm.status).toBe(403);

      await fetch(
        `${listening.origin}/teams/${team.teamId}/members/${target.memberId}`,
        {
          method: "DELETE",
          headers: authHeaders({
            kind: "session",
            accountId: owner.id,
          }),
        },
      );
      // Removal revokes no tokens; the live membership check denies the
      // next call.
      const memberToken = {
        kind: "oauth" as const,
        accountId: member.id,
        email: member.email,
        scopes: ["pages:read"],
        audiences: ["http://localhost:4000"],
      };
      const afterRemove = await fetch(`${listening.origin}/pages`, {
        headers: authHeaders(memberToken, team.teamId),
      });
      expect(afterRemove.status).toBe(403);
      await expect(afterRemove.json()).resolves.toMatchObject({
        error: "not_a_team_member",
      });
      const noTeams = await fetch(`${listening.origin}/pages`, {
        headers: authHeaders(memberToken),
      });
      expect(noTeams.status).toBe(409);
      await expect(noTeams.json()).resolves.toMatchObject({ error: "no_team" });

      // Tokens follow membership: a team joined (or re-joined) after the
      // token was issued is reachable without reconnecting.
      await db.insert(teamMembers).values({
        teamId: team.id,
        accountId: member.id,
        role: "member",
        permissions: ["pages:read"],
      });
      const rejoined = await fetch(`${listening.origin}/pages`, {
        headers: authHeaders({
          ...memberToken,
          oauthIssuedAt: new Date(Date.now() - 60_000),
        }),
      });
      expect(rejoined.status).toBe(200);
    } finally {
      await listening.close();
    }
  });

  it("requires a fresh session for ownership transfer", async () => {
    const { account: owner, team } = await seedTeam(db);
    const member = await seedMember(team.id, [...GRANTABLE_NON_OWNER_PERMISSIONS]);
    const listening = await listenApp();
    try {
      const roster = await fetch(`${listening.origin}/teams/${team.teamId}/members`, {
        headers: authHeaders({
          kind: "session",
          accountId: owner.id,
        }),
      });
      const { items } = (await roster.json()) as {
        items: Array<{ memberId: string; email: string }>;
      };
      const target = items.find((item) => item.email === member.email)!;

      const stale = await fetch(
        `${listening.origin}/teams/${team.teamId}/transfer-ownership`,
        {
          method: "POST",
          headers: authHeaders({
            kind: "session",
            accountId: owner.id,
            email: owner.email,
            sessionAuthenticatedAt: new Date(Date.now() - 11 * 60 * 1000),
          }),
          body: JSON.stringify({ memberId: target.memberId }),
        },
      );
      expect(stale.status).toBe(403);
      await expect(stale.json()).resolves.toMatchObject({
        error: "recent_authentication_required",
      });

      const fresh = await fetch(
        `${listening.origin}/teams/${team.teamId}/transfer-ownership`,
        {
          method: "POST",
          headers: authHeaders({
            kind: "session",
            accountId: owner.id,
            email: owner.email,
            sessionAuthenticatedAt: new Date(),
          }),
          body: JSON.stringify({ memberId: target.memberId }),
        },
      );
      expect(fresh.status).toBe(200);
    } finally {
      await listening.close();
    }
  });
});
