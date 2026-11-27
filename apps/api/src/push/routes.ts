import { Router } from "express";
import { createExpressEndpoints, initServer } from "@ts-rest/express";
import { contract } from "@frontlit/api-contract";
import { requireAuth } from "../auth/middleware";
import { withOperation } from "../auth/authorize";
import { getVapidConfig } from "./config";
import { deletePushSubscription, savePushSubscription } from "./queries";

const s = initServer();
const router = Router();
router.use("/push-subscriptions", requireAuth);

const impl = s.router(contract.pushSubscriptions, {
  config: withOperation("pushSubscriptions.config", async () => ({
    status: 200,
    body: { publicKey: getVapidConfig()?.publicKey ?? null },
  })),
  save: withOperation("pushSubscriptions.save", async ({ body, req }) => {
    const userAgent = req.headers["user-agent"]?.slice(0, 512) ?? null;
    await savePushSubscription({
      accountId: (req as any).accountId,
      endpoint: body.endpoint,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
      userAgent,
    });
    return { status: 204, body: undefined };
  }),
  remove: withOperation("pushSubscriptions.remove", async ({ body, req }) => {
    await deletePushSubscription((req as any).accountId, body.endpoint);
    return { status: 204, body: undefined };
  }),
});

createExpressEndpoints(contract.pushSubscriptions, impl, router);

export default router;
