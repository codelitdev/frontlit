import { describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { makeTestDb, seedTeam, type TestDb } from "../../test/db";
vi.mock("../../db/client", async () => ({ db: await makeTestDb() }));
import { db as appDb } from "../../db/client";
import {
  accounts,
  apiKeys,
  authUser,
  authSession,
  authOAuthClient,
  authOAuthConsent,
  teamMembers,
} from "../../db/schema";
import type { AuthzContext } from "../../auth/authorize";
import {
  assertGitPublisherCredential,
  resolveGitPublisherCredential,
} from "./publisher";
const db = appDb as unknown as TestDb;
async function fixture() {
  const { team, account } = await seedTeam(db);
  const uid = crypto.randomUUID(),
    sessionId = crypto.randomUUID(),
    sessionToken = crypto.randomUUID();
  await db.insert(authUser).values({
    id: uid,
    name: "Publisher",
    email: account.email,
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  await db.update(accounts).set({ authUserId: uid }).where(eq(accounts.id, account.id));
  await db.insert(authSession).values({
    id: sessionId,
    token: sessionToken,
    userId: uid,
    expiresAt: new Date(Date.now() + 3600_000),
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const actor: AuthzContext = {
    teamId: team.id,
    accountId: account.id,
    authKind: "session",
    isOwner: true,
    permissions: [],
    scopes: [],
    audiences: [],
  };
  return { team, account, actor, uid, sessionId, sessionToken };
}
describe("Git publisher credential references", () => {
  it("captures only session IDs and checks current session revocation before another write", async () => {
    const f = await fixture();
    const ref = await resolveGitPublisherCredential(f.actor, {
      cookie: `better-auth.session_token=${f.sessionToken}.signature`,
    });
    expect(ref).toMatchObject({ kind: "session", sessionId: f.sessionId });
    expect(JSON.stringify(ref)).not.toContain(f.sessionToken);
    await assertGitPublisherCredential(f.team.id, ref);
    await db.delete(authSession).where(eq(authSession.id, f.sessionId));
    await expect(assertGitPublisherCredential(f.team.id, ref)).rejects.toMatchObject({
      code: "GITHUB_PUBLISHER_REVOKED",
    });
  });
  it("cannot revive a captured proposal after membership removal and re-addition", async () => {
    const f = await fixture();
    const ref = await resolveGitPublisherCredential(f.actor, {
      cookie: `better-auth.session_token=${f.sessionToken}`,
    });
    await db.delete(teamMembers).where(eq(teamMembers.teamId, f.team.id));
    await db
      .insert(teamMembers)
      .values({ teamId: f.team.id, accountId: f.account.id, role: "owner" });
    await expect(assertGitPublisherCredential(f.team.id, ref)).rejects.toMatchObject({
      code: "GITHUB_PUBLISHER_REVOKED",
    });
  });
  it("checks API key deletion and workspace identity without persisting its secret/hash", async () => {
    const f = await fixture();
    const [key] = await db
      .insert(apiKeys)
      .values({ teamId: f.team.id, keyHash: crypto.randomUUID(), keyPrefix: "test" })
      .returning();
    const ref = await resolveGitPublisherCredential(
      { ...f.actor, authKind: "apikey", apiKeyId: key.id },
      {},
    );
    expect(ref).toEqual({ kind: "apikey", keyId: key.id });
    const other = await seedTeam(db);
    await expect(assertGitPublisherCredential(other.team.id, ref)).rejects.toThrow();
    await db.delete(apiKeys).where(eq(apiKeys.id, key.id));
    await expect(assertGitPublisherCredential(f.team.id, ref)).rejects.toThrow();
  });
  it("uses verified JWT grant references, rejecting consent mutation, disabled clients and token expiry", async () => {
    const f = await fixture();
    const clientId = crypto.randomUUID(),
      consentId = crypto.randomUUID();
    const past = new Date(Date.now() - 10_000),
      now = Math.floor(Date.now() / 1000);
    await db
      .update(teamMembers)
      .set({ createdAt: past })
      .where(eq(teamMembers.teamId, f.team.id));
    await db
      .insert(authOAuthClient)
      .values({ id: crypto.randomUUID(), clientId, redirectUris: [] });
    await db.insert(authOAuthConsent).values({
      id: consentId,
      clientId,
      userId: f.uid,
      referenceId: f.team.id,
      scopes: ["documentation:publish"],
      createdAt: past,
      updatedAt: past,
    });
    // Transport verification is assumed at this domain boundary; no unsigned JWT is accepted by REST/MCP.
    const bearer = `header.${Buffer.from(JSON.stringify({ sub: f.uid, client_id: clientId, team_id: f.team.id, sid: f.sessionId, iat: now, exp: now + 3600 })).toString("base64url")}.verified-signature`;
    const actor = {
      ...f.actor,
      authKind: "oauth" as const,
      scopes: ["documentation:publish"],
    };
    const ref = await resolveGitPublisherCredential(actor, { bearer, clientId });
    expect(ref).toMatchObject({ kind: "oauth", consentId, accessTokenId: null });
    expect(JSON.stringify(ref)).not.toContain(bearer);
    if (ref.kind !== "oauth") throw new Error("Expected OAuth reference");
    await expect(
      assertGitPublisherCredential(f.team.id, {
        ...ref,
        expiresAt: new Date(Date.now() - 1).toISOString(),
      }),
    ).rejects.toThrow();
    await db
      .update(authOAuthClient)
      .set({ disabled: true })
      .where(eq(authOAuthClient.clientId, clientId));
    await expect(assertGitPublisherCredential(f.team.id, ref)).rejects.toThrow();
    await db
      .update(authOAuthClient)
      .set({ disabled: false })
      .where(eq(authOAuthClient.clientId, clientId));
    await db
      .update(authOAuthConsent)
      .set({ updatedAt: new Date(), scopes: [] })
      .where(eq(authOAuthConsent.id, consentId));
    await expect(assertGitPublisherCredential(f.team.id, ref)).rejects.toThrow();
    await expect(
      resolveGitPublisherCredential({ ...actor, scopes: [] }, { bearer, clientId }),
    ).rejects.toThrow();
  });
});
