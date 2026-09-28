import { beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { makeTestDb, seedTeam, truncateAll, type TestDb } from "../test/db";

const sentInvites: Array<{ acceptUrl: string; to: string }> = [];

vi.mock("../db/client", async () => ({
  db: await makeTestDb(),
  sqlTransactionsEnabled: false,
}));
vi.mock("./invitation-email", () => ({
  InvitationDeliveryError: class extends Error {},
  sendInvitationEmail: async (input: { acceptUrl: string; to: string }) => {
    sentInvites.push(input);
  },
}));

import { db as testDb } from "../db/client";
import {
  accounts,
  authorizationAuditEvents,
  teamInvitations,
  teamMembers,
  teams,
} from "../db/schema";
import {
  deleteExpiredAuditEvents,
  insertAuditEvent,
  listAuditEventsByType,
} from "./audit";
import { GRANTABLE_NON_OWNER_PERMISSIONS } from "@frontlit/api-contract";
import { deleteAccount, ensureFrontLitAccountForUser } from "../account/queries";
import { listTeamsForAccount } from "./queries";
import {
  MembershipError,
  acceptInvitation,
  createOrResendInvitation,
  expirePendingInvitations,
  listTeamMembers,
  previewInvitation,
  rejectInvitation,
  removeOrLeaveMember,
  resendTeamInvitation,
  transferOwnership,
  updateMemberPermissions,
} from "./membership";

const db = testDb as unknown as TestDb;

function tokenFromLastInvite() {
  const url = sentInvites.at(-1)?.acceptUrl ?? "";
  return new URL(url).hash.replace("#token=", "");
}

describe("membership lifecycle", () => {
  beforeEach(async () => {
    sentInvites.length = 0;
    await truncateAll(db);
  });

  it("gives a first-time invitee only the team they accept", async () => {
    const { account: owner, team } = await seedTeam(db);
    const email = "first-time-invitee@example.com";
    const created = await createOrResendInvitation({
      teamId: team.id,
      actorAccountId: owner.id,
      email,
      permissions: ["pages:read"],
    });
    const token = tokenFromLastInvite();
    const invitee = await ensureFrontLitAccountForUser({
      email,
      name: "First Time Invitee",
    });

    expect(await listTeamsForAccount(invitee.id)).toHaveLength(0);

    const accepted = await acceptInvitation({
      invitationId: created.invitationId,
      token,
      accountId: invitee.id,
      accountEmail: invitee.email,
    });
    const memberships = await listTeamsForAccount(invitee.id);

    expect(accepted.teamId).toBe(team.teamId);
    expect(memberships.map((membership) => membership.teamId)).toEqual([team.teamId]);
  });

  it("covers invitation, membership, transfer, audit, and ownership safety", async () => {
    const { account: owner, team } = await seedTeam(db);
    const [invitee] = await db
      .insert(accounts)
      .values({ email: "invitee@example.com" })
      .returning();

    const created = await createOrResendInvitation({
      teamId: team.id,
      actorAccountId: owner.id,
      email: invitee.email,
      permissions: ["pages:read", "pages:write"],
    });
    const firstToken = tokenFromLastInvite();
    expect(created.invitationId).toMatch(/^tinv_/);
    expect(JSON.stringify(created)).not.toContain(firstToken);

    await createOrResendInvitation({
      teamId: team.id,
      actorAccountId: owner.id,
      email: invitee.email,
      permissions: ["pages:read", "pages:write"],
      invitationId: created.invitationId,
    });
    const secondToken = tokenFromLastInvite();
    expect(secondToken).not.toBe(firstToken);

    await expect(
      acceptInvitation({
        invitationId: created.invitationId,
        token: firstToken,
        accountId: invitee.id,
        accountEmail: invitee.email,
      }),
    ).rejects.toBeInstanceOf(MembershipError);

    await expect(
      previewInvitation({
        invitationId: created.invitationId,
        token: secondToken,
        accountEmail: "other@example.com",
      }),
    ).rejects.toMatchObject({ code: "email_mismatch" });

    const firstAccept = await acceptInvitation({
      invitationId: created.invitationId,
      token: secondToken,
      accountId: invitee.id,
      accountEmail: invitee.email,
    });
    const secondAccept = await acceptInvitation({
      invitationId: created.invitationId,
      token: secondToken,
      accountId: invitee.id,
      accountEmail: invitee.email,
    });
    expect(firstAccept.memberId).toBe(secondAccept.memberId);
    expect(firstAccept.teamId).toBe(team.teamId);
    expect(secondAccept.teamId).toBe(team.teamId);
    const members = await db.query.teamMembers.findMany({
      where: eq(teamMembers.teamId, team.id),
    });
    expect(members.filter((row) => row.accountId === invitee.id)).toHaveLength(1);

    const [otherInvitee] = await db
      .insert(accounts)
      .values({ email: "retry@example.com" })
      .returning();
    const retryInvite = await createOrResendInvitation({
      teamId: team.id,
      actorAccountId: owner.id,
      email: otherInvitee.email,
      permissions: ["pages:read"],
    });
    const retryToken = tokenFromLastInvite();
    await db.insert(teamMembers).values({
      teamId: team.id,
      accountId: otherInvitee.id,
      role: "member",
      permissions: ["pages:read"],
    });
    const retried = await acceptInvitation({
      invitationId: retryInvite.invitationId,
      token: retryToken,
      accountId: otherInvitee.id,
      accountEmail: otherInvitee.email,
    });
    expect(retried.email).toBe(otherInvitee.email);
    expect(retried.teamId).toBe(team.teamId);
    const [claimed] = await db
      .select()
      .from(teamInvitations)
      .where(eq(teamInvitations.invitationId, retryInvite.invitationId));
    expect(claimed.status).toBe("accepted");

    const updated = await updateMemberPermissions({
      teamId: team.id,
      actorAccountId: owner.id,
      memberId: firstAccept.memberId,
      permissions: ["pages:read"],
      version: firstAccept.version,
    });
    await expect(
      updateMemberPermissions({
        teamId: team.id,
        actorAccountId: owner.id,
        memberId: firstAccept.memberId,
        permissions: ["themes:read"],
        version: firstAccept.version,
      }),
    ).rejects.toMatchObject({ code: "stale_version" });
    expect(updated.permissions).toEqual(["pages:read"]);

    const [manager] = await db
      .insert(accounts)
      .values({ email: "manager@example.com" })
      .returning();
    await db.insert(teamMembers).values({
      teamId: team.id,
      accountId: manager.id,
      role: "member",
      permissions: ["pages:read"],
    });
    await expect(
      updateMemberPermissions({
        teamId: team.id,
        actorAccountId: manager.id,
        memberId: firstAccept.memberId,
        permissions: ["pages:read"],
        version: updated.version,
      }),
    ).rejects.toMatchObject({ code: "forbidden" });

    await expect(
      removeOrLeaveMember({
        teamId: team.id,
        actorAccountId: owner.id,
        leave: true,
      }),
    ).rejects.toMatchObject({ code: "forbidden" });

    const transferred = await transferOwnership({
      teamId: team.id,
      actorAccountId: owner.id,
      memberId: firstAccept.memberId,
    });
    expect(transferred.ownerAccountId).toBe(invitee.id);
    const former = await db.query.teamMembers.findFirst({
      where: and(eq(teamMembers.teamId, team.id), eq(teamMembers.accountId, owner.id)),
    });
    expect(former?.permissions).toEqual([...GRANTABLE_NON_OWNER_PERMISSIONS]);

    await expect(deleteAccount(invitee.id)).rejects.toBeInstanceOf(MembershipError);
    await expect(
      db.delete(accounts).where(eq(accounts.id, invitee.id)),
    ).rejects.toThrow();

    const events = await listAuditEventsByType(team.teamId, "invitation.created");
    expect(events.length).toBeGreaterThan(0);
    expect(JSON.stringify(events)).not.toContain(secondToken);

    const { deleteTeam } = await import("./queries.js");
    await deleteTeam(team.id);
    expect(
      await db.query.teamMembers.findFirst({
        where: eq(teamMembers.teamId, team.id),
      }),
    ).toBeUndefined();
    expect(
      await db.query.teamInvitations.findFirst({
        where: eq(teamInvitations.teamId, team.id),
      }),
    ).toBeUndefined();
    expect(
      await db.query.teams.findFirst({ where: eq(teams.id, team.id) }),
    ).toBeUndefined();
  });

  it("revokes an invitation whose inviter account was deleted", async () => {
    const { team } = await seedTeam(db);
    const [manager] = await db
      .insert(accounts)
      .values({ email: "deleted-inviter@example.com" })
      .returning();
    await db.insert(teamMembers).values({
      teamId: team.id,
      accountId: manager.id,
      role: "member",
      permissions: ["members:invite", "pages:read"],
    });
    const [invitee] = await db
      .insert(accounts)
      .values({ email: "deleted-inviter-target@example.com" })
      .returning();
    const created = await createOrResendInvitation({
      teamId: team.id,
      actorAccountId: manager.id,
      email: invitee.email,
      permissions: ["pages:read"],
    });
    const token = tokenFromLastInvite();
    await db.delete(accounts).where(eq(accounts.id, manager.id));

    await expect(
      acceptInvitation({
        invitationId: created.invitationId,
        token,
        accountId: invitee.id,
        accountEmail: invitee.email,
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
    const invitation = await db.query.teamInvitations.findFirst({
      where: eq(teamInvitations.invitationId, created.invitationId),
    });
    expect(invitation?.invitedByAccountId).toBeNull();
    expect(invitation?.status).toBe("revoked");
  });

  it("revokes a pending invitation when the inviter loses delegation authority", async () => {
    const { team } = await seedTeam(db);
    const [manager] = await db
      .insert(accounts)
      .values({ email: "inviter@example.com" })
      .returning();
    await db.insert(teamMembers).values({
      teamId: team.id,
      accountId: manager.id,
      role: "member",
      permissions: ["members:invite", "pages:write"],
    });
    const [invitee] = await db
      .insert(accounts)
      .values({ email: "later@example.com" })
      .returning();
    const created = await createOrResendInvitation({
      teamId: team.id,
      actorAccountId: manager.id,
      email: invitee.email,
      permissions: ["pages:write"],
    });
    const token = tokenFromLastInvite();
    await db
      .update(teamMembers)
      .set({ permissions: ["pages:read"] })
      .where(eq(teamMembers.accountId, manager.id));
    await expect(
      acceptInvitation({
        invitationId: created.invitationId,
        token,
        accountId: invitee.id,
        accountEmail: invitee.email,
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
    expect(
      await db.query.teamMembers.findFirst({
        where: and(
          eq(teamMembers.teamId, team.id),
          eq(teamMembers.accountId, invitee.id),
        ),
      }),
    ).toBeUndefined();
    const staleInvitation = await db.query.teamInvitations.findFirst({
      where: eq(teamInvitations.invitationId, created.invitationId),
    });
    expect(staleInvitation?.status).toBe("revoked");
    expect(await listAuditEventsByType(team.teamId, "invitation.revoked")).toHaveLength(
      1,
    );
  });

  it("rejects reused rejected tokens", async () => {
    const { account: owner, team } = await seedTeam(db);
    const [invitee] = await db
      .insert(accounts)
      .values({ email: "reject@example.com" })
      .returning();
    const created = await createOrResendInvitation({
      teamId: team.id,
      actorAccountId: owner.id,
      email: invitee.email,
      permissions: ["pages:read"],
    });
    const token = tokenFromLastInvite();
    await rejectInvitation({
      invitationId: created.invitationId,
      token,
      accountId: invitee.id,
      accountEmail: invitee.email,
    });
    await expect(
      acceptInvitation({
        invitationId: created.invitationId,
        token,
        accountId: invitee.id,
        accountEmail: invitee.email,
      }),
    ).rejects.toBeInstanceOf(MembershipError);
  });

  it("expires invitations in a bounded auditable transition", async () => {
    const { account: owner, team } = await seedTeam(db);
    const created = await createOrResendInvitation({
      teamId: team.id,
      actorAccountId: owner.id,
      email: "expired@example.com",
      permissions: ["pages:read"],
    });
    await db
      .update(teamInvitations)
      .set({ expiresAt: new Date(Date.now() - 1_000) })
      .where(eq(teamInvitations.invitationId, created.invitationId));

    await expect(expirePendingInvitations({ teamId: team.id, limit: 1 })).resolves.toBe(
      1,
    );
    const invitation = await db.query.teamInvitations.findFirst({
      where: eq(teamInvitations.invitationId, created.invitationId),
    });
    expect(invitation?.status).toBe("expired");
    expect(await listAuditEventsByType(team.teamId, "invitation.expired")).toHaveLength(
      1,
    );
  });

  it("deletes expired audit rows in bounded batches", async () => {
    const { account: owner, team } = await seedTeam(db);
    await insertAuditEvent(db as any, {
      eventType: "api_key.created",
      teamPublicId: team.teamId,
      actorAccountId: owner.id,
    });
    await insertAuditEvent(db as any, {
      eventType: "api_key.revoked",
      teamPublicId: team.teamId,
      actorAccountId: owner.id,
    });
    await db
      .update(authorizationAuditEvents)
      .set({ expiresAt: new Date(Date.now() - 1_000) });

    await expect(deleteExpiredAuditEvents(new Date(), 1)).resolves.toBe(1);
    expect(await db.query.authorizationAuditEvents.findMany()).toHaveLength(1);
  });

  it("returns viewer authority outside the page and resends beyond 100 invitations", async () => {
    const { account: owner, team } = await seedTeam(db);
    const [viewer] = await db
      .insert(accounts)
      .values({ email: "viewer@example.com" })
      .returning();
    await db.insert(teamMembers).values({
      teamId: team.id,
      accountId: viewer.id,
      role: "member",
      permissions: ["members:read"],
    });
    const memberPage = await listTeamMembers({
      teamId: team.id,
      ownerAccountId: owner.id,
      viewerAccountId: viewer.id,
      limit: 1,
    });
    expect(memberPage.items).toHaveLength(1);
    expect(memberPage.viewer.email).toBe(viewer.email);
    expect(memberPage.viewer.effectivePermissions).toContain("members:read");
    expect(memberPage.nextCursor).toBeTruthy();

    const invitations = await db
      .insert(teamInvitations)
      .values(
        Array.from({ length: 101 }, (_, index) => ({
          teamId: team.id,
          email: `pending-${index}@example.com`,
          permissions: ["pages:read"],
          invitedByAccountId: owner.id,
          tokenHash: `hash-${index}`,
          expiresAt: new Date(Date.now() + 60_000),
        })),
      )
      .returning();
    const target = invitations.at(-1)!;
    await expect(
      resendTeamInvitation({
        teamId: team.id,
        actorAccountId: owner.id,
        invitationId: target.invitationId,
      }),
    ).resolves.toMatchObject({ invitationId: target.invitationId });
  });
});
