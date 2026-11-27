import { z } from "zod";

/** The VAPID public key browsers subscribe with. Null when the server has no
 * Web Push keys configured, so the web app falls back to in-tab alerts. */
export const pushConfigSchema = z.object({
  publicKey: z.string().nullable(),
});

/** `PushSubscription.toJSON()` from the browser. */
export const savePushSubscriptionBodySchema = z.object({
  endpoint: z.string().url().max(2048),
  keys: z.object({
    p256dh: z.string().min(1).max(512),
    auth: z.string().min(1).max(512),
  }),
});

export const deletePushSubscriptionBodySchema = z.object({
  endpoint: z.string().max(2048),
});

export type PushConfig = z.infer<typeof pushConfigSchema>;
export type SavePushSubscriptionBody = z.infer<typeof savePushSubscriptionBodySchema>;
