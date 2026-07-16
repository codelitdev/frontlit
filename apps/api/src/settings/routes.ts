import { Router } from "express";
import { createExpressEndpoints, initServer } from "@ts-rest/express";
import { contract } from "@frontlit/api-contract";
import { requireAuth } from "../auth/middleware";
import { requireTeam } from "../auth/require-team";
import { findTeamById, getTeamMembership } from "../team/queries";
import { getTeamSettings, updateTeamSettings } from "./queries";
import { omitInternal, serializeDates } from "../utils/public";
import { revalidateTeam } from "../services/revalidate";

const router = Router();
router.use(requireAuth);
router.use(requireTeam);

const s = initServer();

function toPublicSettings<T extends Record<string, unknown>>(settings: T) {
    return serializeDates(omitInternal(settings, "teamId"));
}

const impl = s.router(contract.settings, {
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
        const editsInjection = body.codeInjectionHead !== undefined || body.codeInjectionBody !== undefined;
        if (editsInjection && (req as any).authKind === "session") {
            const membership = await getTeamMembership((req as any).teamId, (req as any).accountId);
            if (membership?.role !== "owner") {
                return { status: 403, body: { error: "Only the team owner can edit code injection" } };
            }
        }
        const settings = await updateTeamSettings((req as any).teamId, body);
        const team = await findTeamById((req as any).teamId);
        if (team) revalidateTeam(team.teamId).catch(() => {});
        return { status: 200, body: toPublicSettings(settings) };
    },
});

createExpressEndpoints(contract.settings, impl, router);

export default router;
