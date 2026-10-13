import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { accounts, teams } from "../db/schema";
import { logger } from "../services/log";
import { getSendlitApiKey, storeSendlitApiKey } from "../integrations/queries";
import { enqueueOutboxJob, requeueTeamProvisionJob } from "./outbox";
import {
  createSendlitTeamKey,
  provisionSendlitTeam,
  SendlitApiError,
} from "./sendlit-client";

async function provisionAndStoreSendlitKey(team: {
  id: string;
  teamId: string;
  name: string;
}) {
  const result = await provisionSendlitTeam({
    externalId: team.teamId,
    name: team.name,
  });
  // SendLit returns the team key only on a newly-created team. If an earlier
  // attempt created the SendLit team but crashed before FrontLit saved that
  // one-time secret, mint a replacement so the integration can recover.
  const apiKey = result.apiKey ?? (await createSendlitTeamKey(result.teamId));
  await storeSendlitApiKey(team.id, apiKey);
}

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
    // Email integration is optional (e.g. local dev without a
    // SendLit instance running) — silently skip rather than retry
    // forever against a URL that will never be configured.
    return;
  }

  try {
    await provisionAndStoreSendlitKey(team);
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
  await provisionAndStoreSendlitKey(team);
}

/** Team-admin manual retry: requeue the outbox row and run provision now
 * so `/settings/esp` can recover without waiting for the next worker tick. */
export async function retryProvisionSendlitNow(teamId: string): Promise<{
  connected: boolean;
  error?: string;
}> {
  if (await getSendlitApiKey(teamId)) {
    return { connected: true };
  }
  if (!process.env.SENDLIT_API_URL) {
    return {
      connected: false,
      error: "SENDLIT_API_URL is not configured",
    };
  }

  const team = await db.query.teams.findFirst({
    where: eq(teams.id, teamId),
  });
  if (!team) {
    return { connected: false, error: "team_not_found" };
  }
  const owner = await db.query.accounts.findFirst({
    where: eq(accounts.id, team.ownerAccountId),
  });
  const ownerEmail = owner?.email ?? "";
  await requeueTeamProvisionJob(team.id, { ownerEmail });

  try {
    await provisionAndStoreSendlitKey(team);
    return { connected: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.warn(
      { teamId: team.teamId, error },
      "Manual SendLit provision retry failed",
    );
    return { connected: false, error };
  }
}

export { SendlitApiError };
