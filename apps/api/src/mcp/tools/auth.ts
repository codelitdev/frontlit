/** MCP tool handlers receive the resolved team id via `extra.authInfo.clientId`
 * (see `mcp/routes.ts`'s `getMcpAuth`, populated by `auth/middleware.ts` +
 * `auth/require-team.ts`). A key always resolves to exactly one team; a
 * session resolves to its sole team if the account only has one, otherwise
 * the connection is rejected by `requireTeam`. */
export function getTeamId(extra: any): string | null {
    return extra?.authInfo?.clientId || null;
}

/** The logged-in human, when authenticated via session — `null` for
 * API-key sessions (a key has no single owning account; a team can have
 * several members). Only used for account-level tools like team
 * management, never for team-scoped authorization. */
export function getAuthAccount(extra: any): { id: string; email: string } | null {
    return extra?.authInfo?.account || null;
}
