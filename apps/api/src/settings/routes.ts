import { Router } from "express";
import { createExpressEndpoints, initServer } from "@ts-rest/express";
import { contract } from "@frontlit/api-contract";
import { requireAuth } from "../auth/middleware";
import { requireTeam } from "../auth/require-team";
import { authorizeHandlers } from "../auth/authorize";
import { settingsUpdateOperation } from "../auth/operation-policy";
import { findTeamById } from "../team/queries";
import {
  getTeamSettings,
  InvalidSiteThemeReferenceError,
  updateTeamSettings,
} from "./queries";
import { omitInternal, serializeDates } from "../utils/public";
import { revalidateTeam } from "../services/revalidate";
import {
  deleteEspConfig,
  getEspConfig,
  testEspConfig,
  upsertEspConfig,
} from "../email/sendlit-client";
import { withSendlitKey } from "../email/proxy";

const router = Router();
router.use("/settings", requireAuth, requireTeam);

const s = initServer();

function toPublicSettings<T extends Record<string, unknown>>(settings: T) {
  return serializeDates(
    omitInternal(settings, "teamId", "draftSharedWidgets", "activeReleaseId"),
  );
}

const teamSettingsContract = {
  get: contract.settings.get,
  update: contract.settings.update,
};

const impl = s.router(
  teamSettingsContract,
  authorizeHandlers(
    {
      get: async ({ req }) => {
        const settings = await getTeamSettings((req as any).teamId);
        return { status: 200, body: toPublicSettings(settings) };
      },
      update: async ({ body, req }) => {
        try {
          const settings = await updateTeamSettings((req as any).teamId, body);
          const team = await findTeamById((req as any).teamId);
          if (team) revalidateTeam(team.teamId).catch(() => {});
          return { status: 200, body: toPublicSettings(settings) };
        } catch (error) {
          if (error instanceof InvalidSiteThemeReferenceError) {
            return { status: 400, body: { error: error.message } };
          }
          throw error;
        }
      },
    },
    {
      get: "settings.get",
      update: (args) => settingsUpdateOperation(args.body),
    },
  ),
);

const espImpl = s.router(
  contract.settings.esp,
  authorizeHandlers(
    {
      get: async ({ req }) => withSendlitKey((req as any).teamId, getEspConfig) as any,
      upsert: async ({ body, req }) =>
        withSendlitKey((req as any).teamId, (apiKey) =>
          upsertEspConfig(apiKey, body),
        ) as any,
      remove: async ({ req }) => {
        const result = await withSendlitKey((req as any).teamId, deleteEspConfig);
        return (
          result.status === 200 ? { status: 204, body: undefined } : result
        ) as any;
      },
      test: async ({ body, req }) =>
        withSendlitKey((req as any).teamId, (apiKey) =>
          testEspConfig(apiKey, body.to),
        ) as any,
    },
    {
      get: "settings.esp.get",
      upsert: "settings.esp.upsert",
      remove: "settings.esp.remove",
      test: "settings.esp.test",
    },
  ),
);

createExpressEndpoints(teamSettingsContract, impl, router);
createExpressEndpoints(contract.settings.esp, espImpl, router);

export default router;
