import webpush, { WebPushError } from "web-push";
import { enqueueOutboxJob } from "../email/outbox";
import { logger } from "../services/log";
import { getVapidConfig } from "./config";
import {
  deletePushSubscriptionsByEndpoint,
  listHelpdeskPushSubscriptions,
} from "./queries";

/** What the service worker (apps/web/public/sw.js) shows. */
export type PushPayload = { title: string; body: string; url: string; tag: string };

/** Queues a push to the team's help desk agents for a customer message that
 * needs a person. Does nothing when Web Push isn't configured. */
export async function enqueueNeedsReplyPush(
  teamId: string,
  ticketId: string,
  message: { from: string; text: string },
) {
  if (!getVapidConfig()) return;
  const payload: PushPayload = {
    title: `New message from ${message.from}`,
    body: message.text.trim().slice(0, 140),
    url: `/?ticket=${ticketId}`,
    tag: ticketId,
  };
  await enqueueOutboxJob(teamId, "web_push", payload);
}

/** Outbox handler: sends the push to every subscribed agent. Subscriptions
 * the push service says are gone (404/410), or rejects for our key (403,
 * e.g. made before the VAPID keys changed), are deleted; the browser
 * subscribes again with the current key the next time FrontLit opens. Throws, so the
 * outbox retries, only when a push service failed in a way that may pass;
 * the shared `tag` keeps a retried push from stacking up on devices that
 * already got it. */
export async function processWebPush(teamId: string, payload: Record<string, unknown>) {
  const vapid = getVapidConfig();
  if (!vapid) return;
  const subscriptions = await listHelpdeskPushSubscriptions(teamId);
  if (subscriptions.length === 0) return;

  const body = JSON.stringify({
    title: String(payload.title ?? ""),
    body: String(payload.body ?? ""),
    url: String(payload.url ?? "/"),
    tag: String(payload.tag ?? ""),
  } satisfies PushPayload);

  const gone: string[] = [];
  let retryable: string | null = null;
  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          body,
          {
            vapidDetails: vapid,
            TTL: 60 * 60,
            urgency: "high",
            topic: topicFor(String(payload.tag ?? "")),
          },
        );
      } catch (error) {
        const status = error instanceof WebPushError ? error.statusCode : undefined;
        if (status === 404 || status === 410 || status === 403) {
          gone.push(subscription.endpoint);
        } else if (status === undefined || status === 429 || status >= 500) {
          retryable = error instanceof Error ? error.message : String(error);
        } else {
          logger.warn(
            { status, error: error instanceof Error ? error.message : String(error) },
            "Web push rejected",
          );
        }
      }
    }),
  );
  await deletePushSubscriptionsByEndpoint(gone);
  if (retryable) throw new Error(`Web push failed: ${retryable}`);
}

/** Push services replace an undelivered message with the same topic, so an
 * offline device gets one alert per ticket. Topics are at most 32 URL-safe
 * base64 characters. */
function topicFor(tag: string): string | undefined {
  const topic = tag.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32);
  return topic || undefined;
}
