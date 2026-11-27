import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { teams, tickets } from "../db/schema";
import { logger } from "../services/log";
import {
  claimNextOutboxJob,
  markOutboxJobDone,
  markOutboxJobFailed,
  provisionRetryForeverEnabled,
  requeueFailedProvisionJobs,
} from "./outbox";
import {
  addContactTag,
  type SendlitCustomFields,
  updateContact,
  upsertContact,
} from "./sendlit-client";
import { getSendlitApiKey } from "../integrations/queries";
import { retryProvisionSendlitForTeam } from "./provisioning";

/** Upserts the lead as a SendLit contact and tags it `frontlit` plus the
 * capturing page's slug, so email can be segmented by source page
 * (architecture.md §10.2). */
export async function processContactSync(
  teamId: string,
  payload: Record<string, unknown>,
) {
  const apiKey = await getSendlitApiKey(teamId);
  if (!apiKey) throw new Error("Team has no SendLit integration yet");

  const email = String(payload.email);
  const name =
    typeof payload.name === "string" && payload.name.trim()
      ? payload.name.trim()
      : undefined;
  const customFields = requesterCustomFields(payload);
  const contact = await upsertContact(apiKey, {
    email,
    ...(name ? { name } : {}),
    ...(customFields ? { customFields } : {}),
  });
  // SendLit only applies custom fields on create; merge them into an
  // existing contact so the host app's user ID stays current.
  if (customFields && !sameFields(contact.customFields, customFields)) {
    await updateContact(apiKey, contact.contactId, {
      customFields: { ...contact.customFields, ...customFields },
    });
  }
  await addContactTag(apiKey, contact.contactId, "frontlit");
  if (customFields) await addContactTag(apiKey, contact.contactId, "source:in-app");

  // Link the ticket to its contact (docs/embedded-support.md §6.4).
  if (typeof payload.ticketId === "string") {
    await db
      .update(tickets)
      .set({ contactId: contact.contactId })
      .where(eq(tickets.id, payload.ticketId));
  }

  const sourcePath =
    typeof payload.sourcePath === "string" ? payload.sourcePath : undefined;
  if (sourcePath) {
    const tag = `source:${sourcePath.replace(/^\/+/, "").replace(/\/+/g, "-") || "home"}`;
    await addContactTag(apiKey, contact.contactId, tag);
  }
}

/** The host app's user and account from an in-app support session, as
 * SendLit custom fields. Null when the ticket didn't come from one. */
export function requesterCustomFields(
  payload: Record<string, unknown>,
): SendlitCustomFields | null {
  const fields: SendlitCustomFields = {};
  if (typeof payload.externalId === "string") fields.externalId = payload.externalId;
  const account = payload.account as
    | { id?: unknown; name?: unknown; url?: unknown }
    | undefined;
  if (account && typeof account.id === "string") {
    fields.accountId = account.id;
    if (typeof account.name === "string") fields.accountName = account.name;
    if (typeof account.url === "string") fields.accountUrl = account.url;
  }
  return Object.keys(fields).length ? fields : null;
}

function sameFields(
  current: Record<string, unknown> | undefined,
  next: SendlitCustomFields,
): boolean {
  return Object.entries(next).every(([key, value]) => current?.[key] === value);
}

async function processProvisionSendlit(
  teamId: string,
  payload: Record<string, unknown>,
) {
  const team = await db.query.teams.findFirst({
    where: eq(teams.id, teamId),
  });
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
    logger.warn(
      {
        jobId: job.id,
        type: job.type,
        attempts: job.attempts,
        error: message,
      },
      "Outbox job failed, will retry",
    );
    await markOutboxJobFailed(job.id, job.attempts, message, {
      retryForever: job.type === "provision_sendlit" && provisionRetryForeverEnabled(),
    });
  }
  return true;
}

/** Simple in-process poll loop — no separate worker service/queue library
 * needed at this scale (architecture.md §10.2/§13.5). Drains the queue
 * (processing back-to-back while jobs are ready) then sleeps. */
export function startOutboxWorker(intervalMs = 5000): () => void {
  let stopped = false;

  void requeueFailedProvisionJobs()
    .then((count) => {
      if (count > 0) {
        logger.info({ count }, "Requeued failed SendLit provision jobs");
      }
    })
    .catch((err) => {
      logger.error(
        { error: err instanceof Error ? err.message : String(err) },
        "Failed to requeue SendLit provision jobs",
      );
    });

  async function tick() {
    if (stopped) return;
    try {
      let processed = await processOneJob();
      while (processed && !stopped) {
        processed = await processOneJob();
      }
    } catch (err) {
      logger.error(
        { error: err instanceof Error ? err.message : String(err) },
        "Outbox worker tick failed",
      );
    }
    if (!stopped) setTimeout(tick, intervalMs);
  }

  setTimeout(tick, intervalMs);
  return () => {
    stopped = true;
  };
}
