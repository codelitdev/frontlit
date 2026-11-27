import { Router } from "express";
import { createExpressEndpoints, initServer } from "@ts-rest/express";
import { contract } from "@frontlit/api-contract";
import { requireAuth } from "../auth/middleware";
import { requireTeam } from "../auth/require-team";
import { authorizeHandlers } from "../auth/authorize";
import { findTeamById } from "../team/queries";
import { ContextTooLargeError, createSupportSession } from "./sessions";

/** `POST /support-sessions` (docs/embedded-support.md §6.2): the host app's
 * server mints a session when a signed-in user asks for help. */
const router = Router();
router.use("/support-sessions", requireAuth, requireTeam);

const s = initServer();

const impl = s.router(
  contract.supportSessions,
  authorizeHandlers(
    {
      create: async ({ body, req }) => {
        const team = await findTeamById((req as any).teamId);
        if (!team) return { status: 404, body: { error: "Team not found" } };
        try {
          return { status: 201, body: await createSupportSession(team, body) };
        } catch (error) {
          if (error instanceof ContextTooLargeError) {
            return { status: 400, body: { error: error.message } };
          }
          throw error;
        }
      },
    },
    { create: "supportSessions.create" },
  ),
);

createExpressEndpoints(contract.supportSessions, impl, router);

export default router;
