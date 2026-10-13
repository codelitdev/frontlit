import { Router } from "express";
import { createExpressEndpoints, initServer } from "@ts-rest/express";
import { contract } from "@frontlit/api-contract";
import { requireAuth } from "../auth/middleware";
import { requireTeam } from "../auth/require-team";
import { authorizeHandlers } from "../auth/authorize";
import { getChatbotSettings, updateChatbotSettings } from "./queries";
import { findTeamById } from "../team/queries";
import { omitInternal, serializeDates } from "../utils/public";
import { revalidateTeam } from "../services/revalidate";

const router = Router();
router.use("/chatbot", requireAuth, requireTeam);

const s = initServer();

function toPublicSettings<T extends Record<string, unknown>>(settings: T) {
  return serializeDates(omitInternal(settings, "teamId"));
}

const impl = s.router(
  contract.chatbot,
  authorizeHandlers(
    {
      get: async ({ req }) => {
        const settings = await getChatbotSettings((req as any).teamId);
        return { status: 200, body: toPublicSettings(settings) };
      },
      update: async ({ body, req }) => {
        const settings = await updateChatbotSettings((req as any).teamId, body);
        // Public site mounts the floating widget from cached chatbot settings
        // (apps/sites layout) — same ISR path as branding/code-injection.
        const team = await findTeamById((req as any).teamId);
        if (team) revalidateTeam(team.teamId).catch(() => {});
        return { status: 200, body: toPublicSettings(settings) };
      },
    },
    {
      get: "chatbot.get",
      update: "chatbot.update",
    },
  ),
);

createExpressEndpoints(contract.chatbot, impl, router);

export default router;
