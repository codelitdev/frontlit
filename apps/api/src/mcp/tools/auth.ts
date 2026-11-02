import type { ServerContext } from "@modelcontextprotocol/server";
import { getFrontLitMcpAuthInfo } from "../auth-context";

/** The team this tool call runs in. A key always has its one team; for OAuth
 * the tool registry resolves the `teamId` argument (or the account's sole
 * team) against live membership before the handler runs. */
export function getTeamId(extra: any): string | null {
  return getFrontLitMcpAuthInfo(extra as ServerContext)?.extra.teamId ?? null;
}

/** The logged-in human, when authenticated via OAuth — `null` for
 * API-key sessions (a key has no single owning account; a team can have
 * several members). Only used for account-level tools like team
 * management, never for team-scoped authorization. */
export function getAuthAccount(extra: any): { id: string; email: string } | null {
  const account = getFrontLitMcpAuthInfo(extra as ServerContext)?.extra.account;
  return account ? { id: account.id, email: account.email } : null;
}
