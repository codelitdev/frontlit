import { logger } from "../services/log";
import { deleteExpiredAuditEvents } from "./audit";
import { expirePendingInvitations } from "./membership";

const DEFAULT_INTERVAL_MS = 60 * 60 * 1000;

export async function runAuthorizationMaintenance(): Promise<{
    expiredInvitations: number;
    deletedAuditEvents: number;
}> {
    const expiredInvitations = await expirePendingInvitations({ limit: 500 });
    const deletedAuditEvents = await deleteExpiredAuditEvents(new Date(), 500);
    return { expiredInvitations, deletedAuditEvents };
}

/** Runs one bounded batch per tick so cleanup cannot monopolize an API process.
 * Additional expired rows are picked up by later ticks or another instance. */
export function startAuthorizationMaintenance(
    intervalMs = DEFAULT_INTERVAL_MS,
): () => void {
    let stopped = false;

    async function tick() {
        if (stopped) return;
        try {
            const result = await runAuthorizationMaintenance();
            if (result.expiredInvitations || result.deletedAuditEvents) {
                logger.info(result, "Authorization maintenance completed");
            }
        } catch (error) {
            logger.error(
                {
                    error:
                        error instanceof Error ? error.message : String(error),
                },
                "Authorization maintenance failed",
            );
        }
        if (!stopped) setTimeout(tick, intervalMs);
    }

    setTimeout(tick, Math.min(intervalMs, 30_000));
    return () => {
        stopped = true;
    };
}
