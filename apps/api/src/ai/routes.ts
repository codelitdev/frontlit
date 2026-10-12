import { Router } from "express";
import { createExpressEndpoints, initServer } from "@ts-rest/express";
import { contract } from "@frontlit/api-contract";
import { requireAuth } from "../auth/middleware";
import { requireTeam } from "../auth/require-team";
import { authorizeHandlers } from "../auth/authorize";
import { serializeDates } from "../utils/public";
import { deleteAiConfig, getAiConfig, upsertAiConfig } from "./queries";

const router = Router();
router.use("/settings/ai", requireAuth, requireTeam);

const s = initServer();
const impl = s.router(
  contract.ai,
  authorizeHandlers(
    {
      get: async ({ req }) => {
        const config = await getAiConfig((req as any).teamId);
        return {
          status: 200,
          body: config ? serializeDates(config) : null,
        };
      },
      update: async ({ body, req }) => ({
        status: 200,
        body: serializeDates(await upsertAiConfig((req as any).teamId, body)),
      }),
      remove: async ({ req }) => {
        await deleteAiConfig((req as any).teamId);
        return { status: 204, body: undefined };
      },
    },
    {
      get: "ai.get",
      update: "ai.update",
      remove: "ai.remove",
    },
  ),
);

createExpressEndpoints(contract.ai, impl, router);

export default router;
