import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { authSession } from "../db/schema";
import { AUTH_COOKIE_PREFIX } from "./cookie-prefix";

function headerValue(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    return typeof value[0] === "string" ? value[0] : undefined;
  }
  return typeof value === "string" ? value : undefined;
}

export function sessionTokenFromCookieHeader(
  cookie: string | undefined,
): string | undefined {
  if (!cookie) return undefined;
  const match = cookie.match(
    new RegExp(
      `(?:^|;\\s*)(?:__Secure-)?${AUTH_COOKIE_PREFIX}\\.session_token=([^;]+)`,
    ),
  );
  if (!match?.[1]) return undefined;
  let raw = match[1];
  try {
    raw = decodeURIComponent(raw);
  } catch {
    // Cookie values are sometimes already decoded.
  }
  const lastDot = raw.lastIndexOf(".");
  return lastDot > 0 ? raw.slice(0, lastDot) : raw;
}

export async function getSessionAuthenticatedAt(
  userId: string,
  headers?: Record<string, string | string[] | undefined>,
): Promise<Date | undefined> {
  const token = sessionTokenFromCookieHeader(headerValue(headers?.cookie));
  if (!token) return undefined;
  const [current] = await db
    .select({
      createdAt: authSession.createdAt,
      reauthenticatedAt: authSession.reauthenticatedAt,
    })
    .from(authSession)
    .where(and(eq(authSession.token, token), eq(authSession.userId, userId)))
    .limit(1);
  return current?.reauthenticatedAt ?? current?.createdAt;
}

export type OtpChecker = (input: { email: string; otp: string }) => Promise<void>;

export async function completeSessionReverify(
  input: {
    userId: string;
    email: string;
    otp: string;
    headers?: Record<string, string | string[] | undefined>;
  },
  checkOtp: OtpChecker,
): Promise<Date> {
  await checkOtp({ email: input.email, otp: input.otp });
  return markSessionAuthenticated(input.userId, input.headers);
}

export async function markSessionAuthenticated(
  userId: string,
  headers?: Record<string, string | string[] | undefined>,
  at = new Date(),
): Promise<Date> {
  const token = sessionTokenFromCookieHeader(headerValue(headers?.cookie));
  if (!token) {
    throw new Error("Current Better Auth session could not be identified");
  }
  const updated = await db
    .update(authSession)
    .set({ reauthenticatedAt: at, updatedAt: at })
    .where(and(eq(authSession.token, token), eq(authSession.userId, userId)))
    .returning({ reauthenticatedAt: authSession.reauthenticatedAt });
  if (updated[0]?.reauthenticatedAt) return updated[0].reauthenticatedAt;
  throw new Error("No Better Auth session to mark as freshly authenticated");
}
