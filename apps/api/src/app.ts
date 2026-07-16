import express from "express";
import cors from "cors";
import swaggerUi from "swagger-ui-express";
import { toNodeHandler } from "better-auth/node";
import { logger } from "./services/log";
import { auth } from "./auth/better-auth";
import oauthPagesRoutes from "./auth/oauth-pages";
import mcpRoutes from "./mcp/routes";
import provisioningRoutes from "./provisioning/routes";
import teamRoutes from "./team/routes";
import pagesRoutes from "./pages/routes";
import themesRoutes from "./themes/routes";
import mediaRoutes from "./media/routes";
import blogsRoutes from "./documents/blogs-routes";
import docsRoutes from "./documents/docs-routes";
import changelogsRoutes from "./documents/changelogs-routes";
import newsletterRoutes from "./newsletter/routes";
import docSectionsRoutes from "./documentation/routes";
import chatbotRoutes from "./chatbot/routes";
import ticketsRoutes from "./tickets/routes";
import domainsRoutes from "./domains/routes";
import settingsRoutes from "./settings/routes";
import publicRoutes from "./public/routes";
import metricsRoutes from "./metrics/routes";
import { openApiDocument } from "./openapi";

/** Builds the Express app with no side effects (no `listen()`, no DB/env
 * checks) so it can be exercised directly in tests \u2014 see
 * `app.routing.test.ts`, which boots this over `supertest` to catch
 * route-ordering/middleware-scoping bugs that a query-layer unit test
 * can't (e.g. a blanket `router.use(...)` in one router rejecting requests
 * actually bound for a different, later-mounted router). */
export function createApp() {
    const app = express();

    app.set("trust proxy", process.env.ENABLE_TRUST_PROXY === "true" ? 1 : false);

    app.use(cors());
    // Mounted before express.json(): Better Auth's Node handler parses its
    // own body from the raw request.
    app.all("/api/auth/*", toNodeHandler(auth));
    app.use(oauthPagesRoutes);
    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));

    app.get("/health", (_req, res) => {
        res.status(200).json({ status: "ok", uptime: process.uptime() });
    });

    app.use(metricsRoutes);

    app.get("/openapi.json", (_req, res) => {
        res.json(openApiDocument);
    });

    // Mounted at /api-docs, not /docs: /docs is the help-docs REST resource
    // (`contract.docs`, matching `/blogs`/`/pages`) — an Express
    // path-prefixed `app.use("/docs", ...)` mount would otherwise shadow
    // all of it, including the literal `/docs/search` route.
    app.use(
        "/api-docs",
        swaggerUi.serve,
        swaggerUi.setup(openApiDocument, {
            explorer: true,
            swaggerOptions: {
                persistAuthorization: true,
                displayRequestDuration: true,
                docExpansion: "none",
                defaultModelsExpandDepth: -1,
            },
        }),
    );

    // Public/self-managed-auth routes first. This order matters: every
    // router below applies a blanket `router.use(requireAuth)` with no path
    // prefix, and Express runs that middleware for *any* request that
    // reaches it — even one that doesn't match any of that router's own
    // routes — rejecting it with 401 before the request ever gets a chance
    // to reach a later, genuinely public router. The MCP endpoint and
    // provisioning endpoint authenticate per-request via API keys or a
    // shared secret, not `requireAuth`; the `/public/*` routes authenticate
    // not at all (resolved by a team's public id instead —
    // architecture.md §5.4). Both must be mounted first.
    app.use(mcpRoutes);
    app.use(provisioningRoutes);
    app.use(publicRoutes);

    app.use(teamRoutes);
    app.use(pagesRoutes);
    app.use(themesRoutes);
    app.use(mediaRoutes);
    app.use(blogsRoutes);
    // Must precede docsRoutes: its literal `/docs/search` path would
    // otherwise be shadowed by docsRoutes' `/docs/:documentId` wildcard.
    app.use(docSectionsRoutes);
    app.use(docsRoutes);
    app.use(changelogsRoutes);
    app.use(newsletterRoutes);
    app.use(chatbotRoutes);
    app.use(ticketsRoutes);
    app.use(domainsRoutes);
    app.use(settingsRoutes);

    app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
        logger.error({ error: err.message, path: req.path, method: req.method }, "Unhandled express error");
        res.status(500).json({ error: "server_error" });
    });

    return app;
}
