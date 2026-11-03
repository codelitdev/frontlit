import type { NextFunction, Request, Response } from "express";
import { loadTeamAuthz } from "./authorize";
import { resolveTeamContext } from "./team-context";

function getHeaderValue(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    return typeof value[0] === "string" ? value[0] : undefined;
  }
  return typeof value === "string" ? value : undefined;
}

/**
 * Resolves `req.teamId` — the one thing every team-scoped resource route
 * actually needs. Must run after `requireAuth`/`mcpAuth`.
 *
 * - API-key requests already have `req.teamId` (a key belongs to exactly one
 *   team). A header naming a different team is rejected.
 * - User credentials — browser sessions and account-wide OAuth tokens — pick
 *   a team with the `X-Frontlit-Team-Id` header, checked against live
 *   membership on every call. Without the header, a sole membership is used;
 *   otherwise the caller must choose.
 */
export async function requireTeam(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const anyReq = req as any;
  if (anyReq.authKind !== "apikey" && !anyReq.accountId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  const resolution = await resolveTeamContext({
    authKind: anyReq.authKind,
    accountId: anyReq.accountId,
    apiKeyTeamId: anyReq.authKind === "apikey" ? anyReq.teamId : undefined,
    requestedTeamId: getHeaderValue(req.headers["x-frontlit-team-id"]),
  });
  if (!resolution.ok) {
    res.status(resolution.status).json(resolution.body);
    return;
  }
  anyReq.teamId = resolution.context.team.id;
  await loadTeamAuthz(req, resolution.context.team.id, resolution.context);
  next();
}
