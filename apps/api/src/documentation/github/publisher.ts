import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import {
  computeEffectivePermissions,
  type TeamPermission,
} from "@frontlit/api-contract";
import type { AuthzContext } from "../../auth/authorize";
import { sessionTokenFromCookieHeader } from "../../auth/session-freshness";
import { db } from "../../db/client";
import {
  accounts,
  apiKeys,
  authOAuthAccessToken,
  authOAuthClient,
  authOAuthConsent,
  authSession,
  teams,
  teamMembers,
} from "../../db/schema";
import { GitHubDocsError } from "./app";

export type GitPublisherCredential =
  | { kind: "apikey"; keyId: string }
  | { kind: "session"; accountId: string; sessionId: string; membershipId: string }
  | {
      kind: "oauth";
      accountId: string;
      membershipId: string;
      clientId: string;
      consentId: string;
      consentUpdatedAt: string;
      sessionId: string | null;
      accessTokenId: string | null;
      issuedAt: string;
      expiresAt: string;
    };
const deny = (): never => {
  throw new GitHubDocsError("GITHUB_PUBLISHER_REVOKED", 403);
};
const scope = "documentation:publish";

/** Resolve only after normal REST/MCP bearer/session verification. Secrets are
 * used for lookup in memory, never stored in proposals or returned to callers. */
export async function resolveGitPublisherCredential(
  actor: AuthzContext,
  input: { cookie?: string; bearer?: string; clientId?: string },
  tx: any = db,
): Promise<GitPublisherCredential> {
  if (!actor.teamId) return deny();
  if (actor.authKind === "apikey") {
    if (!actor.apiKeyId) return deny();
    const value: GitPublisherCredential = { kind: "apikey", keyId: actor.apiKeyId };
    await assertGitPublisherCredential(actor.teamId, value, tx);
    return value;
  }
  if (!actor.accountId || (actor.authKind === "oauth" && !actor.scopes.includes(scope)))
    return deny();
  const account = await tx.query.accounts.findFirst({
    where: eq(accounts.id, actor.accountId),
  });
  const member = await tx.query.teamMembers.findFirst({
    where: and(
      eq(teamMembers.teamId, actor.teamId),
      eq(teamMembers.accountId, actor.accountId),
    ),
  });
  if (!account?.authUserId || !member) return deny();
  if (actor.authKind === "session") {
    const token = sessionTokenFromCookieHeader(input.cookie);
    if (!token) return deny();
    const session = await tx.query.authSession.findFirst({
      where: and(
        eq(authSession.token, token),
        eq(authSession.userId, account.authUserId),
      ),
    });
    if (!session) return deny();
    const value: GitPublisherCredential = {
      kind: "session",
      accountId: account.id,
      sessionId: session.id,
      membershipId: member.memberId,
    };
    await assertGitPublisherCredential(actor.teamId, value, tx);
    return value;
  }
  if (!input.bearer || !input.clientId) return deny();
  const consent = await tx.query.authOAuthConsent.findFirst({
    where: and(
      eq(authOAuthConsent.clientId, input.clientId),
      eq(authOAuthConsent.userId, account.authUserId),
      eq(authOAuthConsent.referenceId, actor.teamId),
    ),
  });
  if (!consent) return deny();
  let sessionId: string | null = null,
    accessTokenId: string | null = null,
    issuedAt: Date,
    expiresAt: Date;
  const parts = input.bearer.split(".");
  if (parts.length === 3) {
    // The transport already verified this JWT's signature, issuer and audience.
    let claims: any;
    try {
      claims = JSON.parse(Buffer.from(parts[1], "base64url").toString());
    } catch {
      return deny();
    }
    if (
      claims.sub !== account.authUserId ||
      (claims.client_id ?? claims.azp) !== input.clientId ||
      claims.team_id !== actor.teamId ||
      !Number.isFinite(claims.iat) ||
      !Number.isFinite(claims.exp)
    )
      return deny();
    if (claims.sid !== undefined && typeof claims.sid !== "string") return deny();
    sessionId = claims.sid ?? null;
    issuedAt = new Date(claims.iat * 1000);
    expiresAt = new Date(claims.exp * 1000);
  } else {
    const token = await tx.query.authOAuthAccessToken.findFirst({
      where: eq(
        authOAuthAccessToken.token,
        createHash("sha256").update(input.bearer).digest("base64url"),
      ),
    });
    if (
      !token ||
      token.userId !== account.authUserId ||
      token.clientId !== input.clientId ||
      token.referenceId !== actor.teamId ||
      !token.scopes.includes(scope)
    )
      return deny();
    accessTokenId = token.id;
    sessionId = token.sessionId;
    issuedAt = token.createdAt;
    expiresAt = token.expiresAt;
  }
  if (
    issuedAt < member.createdAt ||
    issuedAt < consent.createdAt ||
    expiresAt <= new Date()
  )
    return deny();
  const value: GitPublisherCredential = {
    kind: "oauth",
    accountId: account.id,
    membershipId: member.memberId,
    clientId: input.clientId,
    consentId: consent.id,
    consentUpdatedAt: consent.updatedAt.toISOString(),
    sessionId,
    accessTokenId,
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
  await assertGitPublisherCredential(actor.teamId, value, tx);
  return value;
}

/** Call immediately before EVERY external write, not merely when queued. */
export async function assertGitPublisherCredential(
  teamId: string,
  credential: GitPublisherCredential,
  tx: any = db,
  requiredPermissions: readonly TeamPermission[] = ["documentation:publish"],
) {
  if (credential.kind === "apikey") {
    if (requiredPermissions.includes("documentation:manage")) return deny();
    const key = await tx.query.apiKeys.findFirst({
      where: and(eq(apiKeys.id, credential.keyId), eq(apiKeys.teamId, teamId)),
    });
    if (!key) return deny();
    return;
  }
  const account = await tx.query.accounts.findFirst({
    where: eq(accounts.id, credential.accountId),
  });
  const member = await tx.query.teamMembers.findFirst({
    where: and(
      eq(teamMembers.teamId, teamId),
      eq(teamMembers.accountId, credential.accountId),
    ),
  });
  const team = await tx.query.teams.findFirst({ where: eq(teams.id, teamId) });
  if (
    !account?.authUserId ||
    !member ||
    member.memberId !== credential.membershipId ||
    !team
  )
    return deny();
  const permissions = computeEffectivePermissions(member.permissions, {
    isOwner: team.ownerAccountId === account.id,
  });
  if (requiredPermissions.some((permission) => !permissions.includes(permission)))
    return deny();
  if (credential.sessionId) {
    const session = await tx.query.authSession.findFirst({
      where: eq(authSession.id, credential.sessionId),
    });
    if (
      !session ||
      session.userId !== account.authUserId ||
      session.expiresAt <= new Date()
    )
      return deny();
  } else if (credential.kind === "session") return deny();
  if (credential.kind === "oauth") {
    if (
      new Date(credential.expiresAt) <= new Date() ||
      new Date(credential.issuedAt) < member.createdAt
    )
      return deny();
    const consent = await tx.query.authOAuthConsent.findFirst({
      where: eq(authOAuthConsent.id, credential.consentId),
    });
    const client = await tx.query.authOAuthClient.findFirst({
      where: eq(authOAuthClient.clientId, credential.clientId),
    });
    if (
      !client ||
      client.disabled ||
      !consent ||
      consent.clientId !== credential.clientId ||
      consent.userId !== account.authUserId ||
      consent.referenceId !== teamId ||
      consent.updatedAt.toISOString() !== credential.consentUpdatedAt ||
      requiredPermissions.some((permission) => !consent.scopes.includes(permission))
    )
      return deny();
    if (credential.accessTokenId) {
      const token = await tx.query.authOAuthAccessToken.findFirst({
        where: eq(authOAuthAccessToken.id, credential.accessTokenId),
      });
      if (
        !token ||
        token.expiresAt <= new Date() ||
        token.userId !== account.authUserId ||
        token.referenceId !== teamId ||
        token.clientId !== credential.clientId ||
        requiredPermissions.some((permission) => !token.scopes.includes(permission))
      )
        return deny();
    }
  }
}
