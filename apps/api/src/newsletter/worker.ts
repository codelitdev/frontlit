import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { teams } from "../db/schema";
import { logger } from "../services/log";
import { claimNextOutboxJob, markOutboxJobDone, markOutboxJobFailed } from "./outbox";
import { addContactTag, upsertContact } from "./sendlit-client";
import { getSendlitApiKey } from "../integrations/queries";
import { retryProvisionSendlitForTeam } from "./provisioning";

/** Upserts the lead as a SendLit contact and tags it `frontlit` plus the
 * capturing page's slug, so newsletters can be segmented by source page
 * (architecture.md §10.2). */
async function processContactSync(teamId: string, payload: Record<string, unknown>) {
    const apiKey = await getSendlitApiKey(teamId);
    if (!apiKey) throw new Error("Team has no SendLit integration yet");

    const email = String(payload.email);
    const contact = await upsertContact(apiKey, { email });
    await addContactTag(apiKey, contact.contactId, "frontlit");

    const sourcePath = typeof payload.sourcePath === "string" ? payload.sourcePath : undefined;
    if (sourcePath) {
        const tag = `source:${sourcePath.replace(/^\/+/, "").replace(/\/+/g, "-") || "home"}`;
        await addContactTag(apiKey, contact.contactId, tag);
    }
}

async function processProvisionSendlit(teamId: string, payload: Record<string, unknown>) {
    const team = await db.query.teams.findFirst({ where: eq(teams.id, teamId) });
    if (!team) return; // Team was deleted before the retry ran.
    await retryProvisionSendlitForTeam(team, String(payload.ownerEmail));
}

async function processOneJob(): Promise<boolean> {
    const job = await claimNextOutboxJob();
    if (!job) return false;

    try {
        if (job.type === "contact_sync") {
            await processContactSync(job.teamId, job.payload);
        } else if (job.type === "provision_sendlit") {
            await processProvisionSendlit(job.teamId, job.payload);
        }
        await markOutboxJobDone(job.id);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.warn({ jobId: job.id, type: job.type, attempts: job.attempts, error: message }, "Outbox job failed, will retry");
        await markOutboxJobFailed(job.id, job.attempts, message);
    }
    return true;
}

/** Simple in-process poll loop — no separate worker service/queue library
 * needed at this scale (architecture.md §10.2/§13.5). Drains the queue
 * (processing back-to-back while jobs are ready) then sleeps. */
export function startOutboxWorker(intervalMs = 5000): () => void {
    let stopped = false;

    async function tick() {
        if (stopped) return;
        try {
            let processed = await processOneJob();
            while (processed && !stopped) {
                processed = await processOneJob();
            }
        } catch (err) {
            logger.error({ error: err instanceof Error ? err.message : String(err) }, "Outbox worker tick failed");
        }
        if (!stopped) setTimeout(tick, intervalMs);
    }

    setTimeout(tick, intervalMs);
    return () => {
        stopped = true;
    };
}
