import { Router } from "express";
import { createExpressEndpoints, initServer } from "@ts-rest/express";
import { contract } from "@frontlit/api-contract";
import { requireAuth } from "../auth/middleware";
import { requireTeam } from "../auth/require-team";
import { getChatbotSettings, updateChatbotSettings } from "./queries";
import { omitInternal, serializeDates } from "../utils/public";

const router = Router();
router.use(requireAuth);
router.use(requireTeam);

const s = initServer();

function toPublicSettings<T extends Record<string, unknown>>(settings: T) {
    return serializeDates(omitInternal(settings, "teamId"));
}

const impl = s.router(contract.chatbot, {
    get: async ({ req }) => {
        const settings = await getChatbotSettings((req as any).teamId);
        return { status: 200, body: toPublicSettings(settings) };
    },
    update: async ({ body, req }) => {
        const settings = await updateChatbotSettings((req as any).teamId, body);
        return { status: 200, body: toPublicSettings(settings) };
    },
});

createExpressEndpoints(contract.chatbot, impl, router);

export default router;
