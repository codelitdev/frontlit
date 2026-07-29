import { Router } from "express";
import { createExpressEndpoints, initServer } from "@ts-rest/express";
import { contract } from "@frontlit/api-contract";
import { requireAuth } from "../auth/middleware";
import { requireTeam } from "../auth/require-team";
import {
    createTheme,
    deleteTheme,
    getThemeByThemeId,
    listThemes,
    updateTheme,
} from "./queries";
import { omitInternal, serializeDates } from "../utils/public";

const router = Router();
router.use("/themes", requireAuth, requireTeam);

const s = initServer();

const impl = s.router(contract.themes, {
    create: async ({ body, req }) => {
        const theme = await createTheme({
            teamId: (req as any).teamId,
            name: body.name,
            style: body.style,
        });
        return {
            status: 201,
            body: serializeDates(omitInternal(theme, "teamId")),
        };
    },
    list: async ({ req }) => {
        const items = await listThemes((req as any).teamId);
        return {
            status: 200,
            body: {
                items: items.map((item) =>
                    serializeDates(omitInternal(item, "teamId")),
                ),
            },
        };
    },
    get: async ({ params, req }) => {
        const theme = await getThemeByThemeId(params.themeId);
        if (!theme || theme.teamId !== (req as any).teamId) {
            return { status: 404, body: { error: "Theme not found" } };
        }
        return {
            status: 200,
            body: serializeDates(omitInternal(theme, "teamId")),
        };
    },
    update: async ({ params, body, req }) => {
        const theme = await updateTheme(
            (req as any).teamId,
            params.themeId,
            body,
        );
        if (!theme) return { status: 404, body: { error: "Theme not found" } };
        return {
            status: 200,
            body: serializeDates(omitInternal(theme, "teamId")),
        };
    },
    remove: async ({ params, req }) => {
        await deleteTheme((req as any).teamId, params.themeId);
        return { status: 204, body: undefined };
    },
});

createExpressEndpoints(contract.themes, impl, router);

export default router;
