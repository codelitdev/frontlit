import { logger } from "../services/log";
import { storeSendlitApiKey } from "../integrations/queries";
import { enqueueOutboxJob } from "./outbox";
import { provisionSendlitTeam, SendlitApiError } from "./sendlit-client";

/**
 * Every FrontLit team gets its own SendLit team, 1:1, provisioned eagerly at
 * creation time (architecture.md §10.1). This never blocks or fails team
 * creation: on error it enqueues a `provision_sendlit` outbox job so the
 * worker (`worker.ts`) retries with backoff until SendLit is reachable.
 */
export async function provisionSendlitForTeam(
    team: { id: string; teamId: string; name: string },
    ownerEmail: string,
): Promise<void> {
    if (!process.env.SENDLIT_API_URL) {
        // Newsletter integration is optional (e.g. local dev without a
        // SendLit instance running) — silently skip rather than retry
        // forever against a URL that will never be configured.
        return;
    }

    try {
        const result = await provisionSendlitTeam({
            externalId: team.teamId,
            ownerEmail,
            name: team.name,
        });
        if (result.apiKey) {
            await storeSendlitApiKey(team.id, result.apiKey);
        }
    } catch (err) {
        logger.warn(
            {
                teamId: team.teamId,
                error: err instanceof Error ? err.message : String(err),
            },
            "SendLit team provisioning failed, will retry",
        );
        await enqueueOutboxJob(team.id, "provision_sendlit", { ownerEmail });
    }
}

/** Re-attempted by the outbox worker when the eager call above failed. */
export async function retryProvisionSendlitForTeam(
    team: { id: string; teamId: string; name: string },
    ownerEmail: string,
): Promise<void> {
    const result = await provisionSendlitTeam({
        externalId: team.teamId,
        ownerEmail,
        name: team.name,
    });
    if (result.apiKey) {
        await storeSendlitApiKey(team.id, result.apiKey);
    }
}

export { SendlitApiError };
