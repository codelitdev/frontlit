import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeTestDb, truncateAll, type TestDb } from "../test/db";

vi.mock("../db/client", async () => ({
  db: await makeTestDb(),
  sqlTransactionsEnabled: false,
}));
vi.mock("./better-auth", () => ({
  auth: { api: { getSession: vi.fn(), checkVerificationOTP: vi.fn() } },
  authIssuer: "https://frontlit.test/api/auth",
  mcpResourceUrl: "https://frontlit.test/mcp",
  validOAuthAudiences: ["https://frontlit.test", "https://frontlit.test/mcp"],
  oauthResourceClient: { getActions: () => ({ verifyBearerToken: vi.fn() }) },
  webClientUrl: "https://frontlit.test",
  authBaseUrl: "https://frontlit.test",
}));

import { db as testDb } from "../db/client";
import { authSession, authUser } from "../db/schema";
import {
  completeSessionReverify,
  getSessionAuthenticatedAt,
  markSessionAuthenticated,
  sessionTokenFromCookieHeader,
} from "./session-freshness";
import { resolveAuth } from "./resolve-auth";

const db = testDb as unknown as TestDb;

describe("session freshness", () => {
  beforeEach(async () => {
    await truncateAll(db);
    await db.delete(authSession);
    await db.delete(authUser);
  });

  it("reads the current Better Auth session createdAt from the cookie", async () => {
    const createdAt = new Date("2026-01-01T00:00:00.000Z");
    await db.insert(authUser).values({
      id: "user-1",
      name: "Owner",
      email: "owner@example.com",
      emailVerified: true,
      createdAt,
      updatedAt: createdAt,
    });
    await db.insert(authSession).values({
      id: "sess-1",
      token: "session-token-1",
      userId: "user-1",
      expiresAt: new Date("2026-12-01T00:00:00.000Z"),
      createdAt,
      updatedAt: createdAt,
    });

    const cookie = "frontlit.session_token=session-token-1.signature";
    await expect(getSessionAuthenticatedAt("user-1", { cookie })).resolves.toEqual(
      createdAt,
    );
  });

  it("OTP re-verify marks the session so requireRecentAuth can pass", async () => {
    const old = new Date("2026-01-01T00:00:00.000Z");
    await db.insert(authUser).values({
      id: "user-1",
      name: "Owner",
      email: "owner@example.com",
      emailVerified: true,
      createdAt: old,
      updatedAt: old,
    });
    await db.insert(authSession).values({
      id: "sess-2",
      token: "session-token-2",
      userId: "user-1",
      expiresAt: new Date("2026-12-01T00:00:00.000Z"),
      createdAt: old,
      updatedAt: old,
    });
    await db.insert(authSession).values({
      id: "sess-1",
      token: "session-token-1",
      userId: "user-1",
      expiresAt: new Date("2026-12-01T00:00:00.000Z"),
      createdAt: old,
      updatedAt: old,
    });

    const headers = {
      cookie: "frontlit.session_token=session-token-1.sig",
    };
    const before = await getSessionAuthenticatedAt("user-1", headers);
    expect(before?.getTime()).toBe(old.getTime());

    const marked = await completeSessionReverify(
      {
        userId: "user-1",
        email: "owner@example.com",
        otp: "123456",
        headers,
      },
      async () => undefined,
    );
    expect(Date.now() - marked.getTime()).toBeLessThan(5_000);

    const after = await getSessionAuthenticatedAt("user-1", headers);
    expect(after?.getTime()).toBe(marked.getTime());
    await expect(markSessionAuthenticated("user-1", headers, marked)).resolves.toEqual(
      marked,
    );
    const sessions = await db.query.authSession.findMany();
    const current = sessions.find((session) => session.id === "sess-1");
    const other = sessions.find((session) => session.id === "sess-2");
    expect(current?.createdAt.getTime()).toBe(old.getTime());
    expect(current?.reauthenticatedAt?.getTime()).toBe(marked.getTime());
    expect(other?.reauthenticatedAt).toBeNull();
    await expect(getSessionAuthenticatedAt("user-1", {})).resolves.toBeUndefined();
    await expect(markSessionAuthenticated("user-1", {})).rejects.toThrow(
      "could not be identified",
    );
  });

  it("parses signed Better Auth session cookies", () => {
    expect(
      sessionTokenFromCookieHeader("foo=1; frontlit.session_token=abc.def; bar=2"),
    ).toBe("abc");
    expect(
      sessionTokenFromCookieHeader("__Secure-frontlit.session_token=tok.sig"),
    ).toBe("tok");
  });
});

describe("resolveAuth sessionAuthenticatedAt on the production path", () => {
  beforeEach(async () => {
    await truncateAll(db);
    await db.delete(authSession);
    await db.delete(authUser);
  });

  it("loads sessionAuthenticatedAt via defaultDependencies", async () => {
    const createdAt = new Date(Date.now() - 60_000);
    await db.insert(authUser).values({
      id: "auth-user-live",
      name: "Owner",
      email: "live@example.com",
      emailVerified: true,
      createdAt,
      updatedAt: createdAt,
    });
    await db.insert(authSession).values({
      id: "sess-live",
      token: "live-token",
      userId: "auth-user-live",
      expiresAt: new Date(Date.now() + 86_400_000),
      createdAt,
      updatedAt: createdAt,
    });

    const result = await resolveAuth(
      { headers: { cookie: "frontlit.session_token=live-token.sig" } },
      {
        getApiKeyBySecret: async () => null,
        resolveSession: async () => ({
          status: "authenticated",
          identity: {
            method: "session",
            issuer: "https://frontlit.test/api/auth",
            subject: "auth-user-live",
            email: "live@example.com",
            name: "Owner",
            scopes: [],
          },
        }),
        authenticateBearer: async () => null,
        ensureAccountForBetterAuthUserId: async () => null,
        ensureAccountForUser: async () => ({
          id: "account-live",
          authUserId: "auth-user-live",
          email: "live@example.com",
          createdAt,
          updatedAt: createdAt,
        }),
        getTeamMembership: async () => null,
        getSessionAuthenticatedAt,
      },
    );
    expect(result).toMatchObject({
      status: "authenticated",
      kind: "session",
    });
    if (result.status === "authenticated" && result.kind === "session") {
      expect(result.sessionAuthenticatedAt?.getTime()).toBe(createdAt.getTime());
    }
  });
});
