import { logger } from "./services/log";
import { createApiKey } from "./apikey/queries";
import { createTeam, findAccountByEmail, findOrCreateBareAccount } from "./team/queries";

/**
 * If `SUPER_ADMIN_EMAIL` is set and no account exists for it yet, create one
 * (with its default team + API key) and log the key once so an operator
 * bringing the stack up via `docker compose` can grab it from `docker
 * compose logs` without any manual sign-in step.
 *
 * This only ever provisions *one* team, once, at container start — it's a
 * dev/self-host convenience, not how a multi-tenant consumer should
 * provision teams. See `provisioning/routes.ts` for that.
 */
export async function createSuperAdminIfMissing(): Promise<void> {
    const email = process.env.SUPER_ADMIN_EMAIL;
    if (!email) return;

    try {
        const existing = await findAccountByEmail(email.toLowerCase());
        if (existing) return;

        const account = await findOrCreateBareAccount(email.toLowerCase());
        const team = await createTeam({ ownerAccountId: account.id, name: "My Team", ownerEmail: account.email });
        const { secret } = await createApiKey(team.id, "Super admin key");

        // Keys are stored hashed, so this log line is the only place the
        // secret ever appears.
        logger.info({ accountId: account.id, teamId: team.teamId, apiKey: secret }, "Super admin account created");
    } catch (err) {
        logger.error({ error: (err as Error).message }, "Failed to create super admin account");
    }
}
