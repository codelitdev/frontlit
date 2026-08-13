import { logger } from "./services/log";
import {
    createAccountWithDefaultTeam,
    findAccountByEmail,
} from "./account/queries";

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

        const account = await createAccountWithDefaultTeam(
            email.toLowerCase(),
            undefined,
            { withDefaultApiKey: true },
        );

        // Keys are stored hashed, so this log line is the only place the
        // secret ever appears.
        logger.info(
            {
                accountId: account.id,
                teamId: account.defaultTeamId,
                apiKey: account.defaultApiKeySecret,
            },
            "Super admin account created",
        );
    } catch (err) {
        logger.error(
            { error: (err as Error).message },
            "Failed to create super admin account",
        );
    }
}
