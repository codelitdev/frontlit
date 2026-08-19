import type { ServerContext } from "@modelcontextprotocol/server";
import { getFrontLitMcpAuthInfo } from "../auth-context";

/** A key always resolves to exactly one team. OAuth resolves from its verified
 * `team_id` claim (or the account's sole team); otherwise `requireTeam`
 * rejects the connection before SDK dispatch. */
export function getTeamId(extra: any): string | null {
    return getFrontLitMcpAuthInfo(extra as ServerContext)?.extra.teamId ?? null;
}

/** The logged-in human, when authenticated via OAuth — `null` for
 * API-key sessions (a key has no single owning account; a team can have
 * several members). Only used for account-level tools like team
 * management, never for team-scoped authorization. */
export function getAuthAccount(
    extra: any,
): { id: string; email: string } | null {
    const account = getFrontLitMcpAuthInfo(extra as ServerContext)?.extra
        .account;
    return account ? { id: account.id, email: account.email } : null;
}
