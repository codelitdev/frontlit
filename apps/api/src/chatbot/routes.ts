import { Router } from "express";
import { createExpressEndpoints, initServer } from "@ts-rest/express";
import { contract } from "@frontlit/api-contract";
import { requireAuth } from "../auth/middleware";
import { requireTeam } from "../auth/require-team";
import { authorizeHandlers } from "../auth/authorize";
import { getChatbotSettings, updateChatbotSettings } from "./queries";
import { omitInternal, serializeDates } from "../utils/public";
import { getEmbedOrigin } from "../domains/queries";
import { findTeamById } from "../team/queries";

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
        const teamId = (req as any).teamId;
        const [settings, team] = await Promise.all([
          getChatbotSettings(teamId),
          findTeamById(teamId),
        ]);
        return {
          status: 200,
          body: {
            ...toPublicSettings(settings),
            // For the copy-ready embed snippet on the Chatbot page.
            ...(team
              ? { embed: { teamId: team.teamId, origin: getEmbedOrigin() } }
              : {}),
          },
        };
      },
      update: async ({ body, req }) => {
        const settings = await updateChatbotSettings((req as any).teamId, body);
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
