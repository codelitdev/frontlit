import { Router } from "express";
import { createExpressEndpoints, initServer } from "@ts-rest/express";
import { contract } from "@frontlit/api-contract";
import { requireAuth } from "../auth/middleware";
import { requireTeam } from "../auth/require-team";
import { findTeamById, getTeamMembership } from "../team/queries";
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
} from "../newsletter/sendlit-client";
import { withSendlitKey } from "../newsletter/proxy";

const router = Router();
router.use("/settings", requireAuth, requireTeam);

const s = initServer();

function toPublicSettings<T extends Record<string, unknown>>(settings: T) {
    return serializeDates(
        omitInternal(settings, "teamId", "sharedWidgets", "draftSharedWidgets"),
    );
}

const teamSettingsContract = {
    get: contract.settings.get,
    update: contract.settings.update,
};

const impl = s.router(teamSettingsContract, {
    get: async ({ req }) => {
        const settings = await getTeamSettings((req as any).teamId);
        return { status: 200, body: toPublicSettings(settings) };
    },
    update: async ({ body, req }) => {
        // Code injection is arbitrary script on the team's own site — a
        // deliberate trust boundary (architecture.md §12.5) restricted to
        // the owner role, same as team deletion. API-key callers are
        // already a team-scoped credential at that same trust level, so
        // only session auth is gated here.
        const editsInjection =
            body.codeInjectionHead !== undefined ||
            body.codeInjectionBody !== undefined;
        if (editsInjection && (req as any).authKind === "session") {
            const membership = await getTeamMembership(
                (req as any).teamId,
                (req as any).accountId,
            );
            if (membership?.role !== "owner") {
                return {
                    status: 403,
                    body: {
                        error: "Only the team owner can edit code injection",
                    },
                };
            }
        }
        try {
            const settings = await updateTeamSettings(
                (req as any).teamId,
                body,
            );
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
});

const espImpl = s.router(contract.settings.esp, {
    get: async ({ req }) =>
        withSendlitKey((req as any).teamId, getEspConfig) as any,
    upsert: async ({ body, req }) =>
        withSendlitKey((req as any).teamId, (apiKey) =>
            upsertEspConfig(apiKey, body),
        ) as any,
    remove: async ({ req }) => {
        const result = await withSendlitKey(
            (req as any).teamId,
            deleteEspConfig,
        );
        return (
            result.status === 200 ? { status: 204, body: undefined } : result
        ) as any;
    },
    test: async ({ body, req }) =>
        withSendlitKey((req as any).teamId, (apiKey) =>
            testEspConfig(apiKey, body.to),
        ) as any,
});

createExpressEndpoints(teamSettingsContract, impl, router);
createExpressEndpoints(contract.settings.esp, espImpl, router);

export default router;
