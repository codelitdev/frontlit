import {
    Router,
    type NextFunction,
    type Request,
    type Response,
} from "express";
import rateLimit from "express-rate-limit";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { createMcpOAuthDiscoveryRoutes } from "@codelitdev/oauth-server-kit/mcp";
import { mcpAuth } from "../auth/middleware";
import { requireTeam } from "../auth/require-team";
import { auth, mcpResourceUrl, oauthResourceClient } from "../auth/better-auth";
import { logger } from "../services/log";
import {
    createFrontLitMcpAuthInfo,
    type FrontLitMcpAuthInfo,
} from "./auth-context";
import {
    HIGH_IMPACT_MCP_TOOLS,
    isMcpToolName,
    MCP_SCOPES_SUPPORTED,
} from "./policy";
import { buildMcpServer } from "./server";

const router = Router();

router.use(
    createMcpOAuthDiscoveryRoutes({
        auth,
        resourceUrl: mcpResourceUrl,
        oauthResourceClient,
        scopesSupported: [...MCP_SCOPES_SUPPORTED],
        allowedOrigins: "*",
    }),
);

const mcpIpLimiter = rateLimit({
    windowMs: 60_000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error: "too_many_requests",
        error_description: "Too many MCP requests from this network.",
    },
});

function principalRateLimitKey(req: Request): string {
    const authInfo = (req as any).auth as FrontLitMcpAuthInfo | undefined;
    const authKind = authInfo?.extra.authKind ?? "unknown";
    const client = authInfo?.clientId ?? "unknown";
    const team = authInfo?.extra.teamId ?? "unknown";
    return `${authKind}:${client}:${team}`;
}

const mcpPrincipalLimiter = rateLimit({
    windowMs: 60_000,
    max: (req) => {
        const tool = String(req.headers["mcp-name"] || "");
        return isMcpToolName(tool) && HIGH_IMPACT_MCP_TOOLS.has(tool) ? 20 : 60;
    },
    keyGenerator: principalRateLimitKey,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error: "too_many_requests",
        error_description: "Too many MCP requests.",
    },
    handler(req, res, _next, options) {
        logger.warn(
            {
                method: req.headers["mcp-method"],
                tool: req.headers["mcp-name"],
                authKind: (req as any).authKind,
            },
            "MCP rate limit exceeded",
        );
        res.status(options.statusCode).json(options.message);
    },
});

function mcpCors(req: Request, res: Response, next: NextFunction) {
    const origin = req.headers.origin || "*";
    res.header("Access-Control-Allow-Origin", origin);
    res.header("Vary", "Origin");
    res.header("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.header(
        "Access-Control-Allow-Headers",
        "Content-Type, Accept, MCP-Protocol-Version, Mcp-Method, Mcp-Name, x-frontlit-apikey, Authorization",
    );
    if (req.method === "OPTIONS") {
        res.status(204).end();
        return;
    }
    next();
}

function attachMcpAuthInfo(req: Request, res: Response, next: NextFunction) {
    const authInfo = createFrontLitMcpAuthInfo(req);
    if (!authInfo) {
        res.status(401).json({
            error: "unauthorized",
            error_description: "MCP authentication context is incomplete.",
        });
        return;
    }
    (req as any).auth = authInfo;
    next();
}

function observeMcpRequest(req: Request, res: Response, next: NextFunction) {
    const startedAt = performance.now();
    res.once("finish", () => {
        logger.info(
            {
                method: req.headers["mcp-method"],
                tool: req.headers["mcp-name"],
                statusCode: res.statusCode,
                durationMs: Math.round(performance.now() - startedAt),
                authKind: (req as any).authKind,
            },
            "MCP request completed",
        );
    });
    next();
}

const mcpHandler = createMcpHandler(() => buildMcpServer(), {
    // Both protocol eras are stateless. SDK 2 owns the compatibility path;
    // FrontLit has no SDK 1 server, session map, or SSE endpoint.
    legacy: "stateless",
    onerror(error) {
        logger.error({ errorType: error.name }, "MCP protocol error");
    },
});

const nodeMcpHandler = toNodeHandler(mcpHandler, {
    onerror(error) {
        logger.error({ errorType: error.name }, "MCP Node adapter error");
    },
});

router.post(
    "/mcp",
    mcpCors,
    mcpIpLimiter,
    mcpAuth,
    requireTeam,
    attachMcpAuthInfo,
    mcpPrincipalLimiter,
    observeMcpRequest,
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            // Mounted before Express body parsing so the official adapter owns
            // JSON parsing, content-type checks, and MCP protocol errors.
            await nodeMcpHandler(req as any, res);
        } catch (error) {
            next(error);
        }
    },
);

router.options("/mcp", mcpCors);

export default router;
