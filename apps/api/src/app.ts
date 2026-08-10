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
 * checks) so routing and middleware composition can be exercised directly
 * in tests. See `middleware-boundaries.test.ts` for the root-mounted router
 * isolation checks. */
export function createApp() {
    const app = express();

    app.set(
        "trust proxy",
        process.env.ENABLE_TRUST_PROXY === "true" ? 1 : false,
    );

    // MCP and its discovery routes own their body parsing and CORS contract.
    // Keep them ahead of the global CORS/body-parser middleware so SDK 2 can
    // validate the wire protocol directly.
    app.use(mcpRoutes);
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

    // Keep this at the same organization-standard path as SendLit. Private
    // help-document CRUD lives at `/help-docs`, leaving `/docs` exclusively
    // for the interactive API reference.
    app.use(
        "/docs",
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

    // Public/self-managed-auth routes stay grouped first for clarity. Domain
    // routers scope their middleware to their own path prefixes, so adding a
    // router can no longer cause its auth or rate limits to intercept an
    // unrelated route mounted later.
    app.use(provisioningRoutes);
    app.use(publicRoutes);

    app.use(teamRoutes);
    app.use(pagesRoutes);
    app.use(themesRoutes);
    app.use(mediaRoutes);
    app.use(blogsRoutes);
    // Must precede docsRoutes: its literal `/help-docs/search` path would
    // otherwise be shadowed by docsRoutes' `/help-docs/:documentId` wildcard.
    app.use(docSectionsRoutes);
    app.use(docsRoutes);
    app.use(changelogsRoutes);
    app.use(newsletterRoutes);
    app.use(chatbotRoutes);
    app.use(ticketsRoutes);
    app.use(domainsRoutes);
    app.use(settingsRoutes);

    app.use(
        (
            err: any,
            req: express.Request,
            res: express.Response,
            _next: express.NextFunction,
        ) => {
            logger.error(
                { error: err.message, path: req.path, method: req.method },
                "Unhandled express error",
            );
            res.status(500).json({ error: "server_error" });
        },
    );

    return app;
}
