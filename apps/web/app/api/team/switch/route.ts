import { NextRequest, NextResponse } from "next/server";
import { hasServerSession } from "@/lib/server-session";
import { safeAppRedirect } from "@/lib/safe-app-redirect";
import { TEAM_ID_COOKIE } from "@/lib/tokens";

/**
 * Sets which team the workspace is "in" — a plain cookie (not a secret; the
 * API re-validates membership on every request via `X-Frontlit-Team-Id`, see
 * `apps/api/src/auth/require-team.ts`). Submitted as a regular form POST so
 * switching works with a plain `<form>`, no client JS required.
 *
 * Redirects use `WEB_CLIENT` (via `safeAppRedirect`) rather than `req.url`,
 * so reverse-proxied deploys don't send the browser to the container bind
 * address (`0.0.0.0:3000`).
 */
export async function POST(req: NextRequest) {
  const cookieHeader = req.headers.get("cookie") ?? "";
  if (!(await hasServerSession(cookieHeader))) {
    return NextResponse.redirect(safeAppRedirect("/login"), 303);
  }

  const form = await req.formData();
  const teamId = String(form.get("teamId") || "");
  const redirectTo = String(form.get("redirectTo") || "/");

  // A form submission must redirect with GET. The default 307 would replay
  // the POST at the destination, where workspace pages do not accept it.
  const res = NextResponse.redirect(safeAppRedirect(redirectTo), 303);
  if (teamId) {
    const isProd = process.env.NODE_ENV === "production";
    // Not httpOnly, deliberately: this is just a "which team am I looking
    // at" selection, not a credential — every API call is re-validated
    // against team membership server-side regardless of what it says.
    res.cookies.set(TEAM_ID_COOKIE, teamId, {
      httpOnly: false,
      sameSite: "lax",
      secure: isProd,
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  return res;
}
