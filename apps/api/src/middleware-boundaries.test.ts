import express, { type Router } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({
    auth: vi.fn(),
    team: vi.fn(),
}));

vi.mock("./auth/middleware", () => ({
    requireAuth: (req: any, _res: any, next: () => void) => {
        calls.auth(req.path);
        req.authKind = "session";
        req.accountId = "account-1";
        next();
    },
}));
vi.mock("./auth/require-team", () => ({
    requireTeam: (req: any, _res: any, next: () => void) => {
        calls.team(req.path);
        next();
    },
}));
vi.mock("./db/client", () => ({ db: {} }));

import pagesRoutes from "./pages/routes";
import themesRoutes from "./themes/routes";
import mediaRoutes from "./media/routes";
import blogsRoutes from "./documents/blogs-routes";
import docSectionsRoutes from "./documentation/routes";
import docsRoutes from "./documents/docs-routes";
import changelogsRoutes from "./documents/changelogs-routes";
import newsletterRoutes from "./newsletter/routes";
import chatbotRoutes from "./chatbot/routes";
import ticketsRoutes from "./tickets/routes";
import domainsRoutes from "./domains/routes";
import settingsRoutes from "./settings/routes";
import teamRoutes from "./team/routes";
import provisioningRoutes from "./provisioning/routes";

const cases: Array<{
    name: string;
    router: Router;
    path: string;
    auth: number;
    team: number;
}> = [
    { name: "pages", router: pagesRoutes, path: "/pages", auth: 1, team: 1 },
    { name: "themes", router: themesRoutes, path: "/themes", auth: 1, team: 1 },
    { name: "media", router: mediaRoutes, path: "/media", auth: 1, team: 1 },
    { name: "blogs", router: blogsRoutes, path: "/blogs", auth: 1, team: 1 },
    {
        name: "doc sections",
        router: docSectionsRoutes,
        path: "/doc-sections",
        auth: 1,
        team: 1,
    },
    { name: "docs", router: docsRoutes, path: "/help-docs", auth: 1, team: 1 },
    {
        name: "changelogs",
        router: changelogsRoutes,
        path: "/changelogs",
        auth: 1,
        team: 1,
    },
    {
        name: "newsletter",
        router: newsletterRoutes,
        path: "/newsletter",
        auth: 1,
        team: 1,
    },
    {
        name: "contacts",
        router: newsletterRoutes,
        path: "/contacts",
        auth: 1,
        team: 1,
    },
    {
        name: "chatbot",
        router: chatbotRoutes,
        path: "/chatbot",
        auth: 1,
        team: 1,
    },
    {
        name: "tickets",
        router: ticketsRoutes,
        path: "/tickets",
        auth: 1,
        team: 1,
    },
    {
        name: "domain",
        router: domainsRoutes,
        path: "/domain",
        auth: 1,
        team: 1,
    },
    {
        name: "settings",
        router: settingsRoutes,
        path: "/settings",
        auth: 1,
        team: 1,
    },
    {
        name: "ESP settings",
        router: settingsRoutes,
        path: "/settings/esp",
        auth: 1,
        team: 1,
    },
    {
        name: "team management",
        router: teamRoutes,
        path: "/teams",
        auth: 1,
        team: 0,
    },
    {
        name: "provisioning",
        router: provisioningRoutes,
        path: "/provisioning/teams",
        auth: 0,
        team: 0,
    },
];

function probe(router: Router) {
    const app = express();
    app.use(router);
    app.use((_req, res) => res.status(204).end());
    return app;
}

async function request(app: express.Express, path: string) {
    const server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No port");
    try {
        return await fetch(`http://127.0.0.1:${address.port}${path}`, {
            method: "OPTIONS",
        });
    } finally {
        await new Promise<void>((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve())),
        );
    }
}

beforeEach(() => vi.clearAllMocks());

describe("root-mounted router middleware boundaries", () => {
    it.each(cases)("$name ignores unrelated paths", async ({ router }) => {
        const response = await request(probe(router), "/__boundary_probe__");
        expect(response.status).toBe(204);
        expect(calls.auth).not.toHaveBeenCalled();
        expect(calls.team).not.toHaveBeenCalled();
    });

    it.each(cases)(
        "$name applies only its intended auth layers",
        async ({ router, path, auth, team }) => {
            const response = await request(probe(router), path);
            expect(response.status).toBeLessThan(400);
            expect(calls.auth).toHaveBeenCalledTimes(auth);
            expect(calls.team).toHaveBeenCalledTimes(team);
        },
    );
});
