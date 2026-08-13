import type { AddressInfo } from "node:net";
import express, { Router } from "express";
import {
    afterEach,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from "vitest";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { McpServer } from "@modelcontextprotocol/server";

const mocks = vi.hoisted(() => ({
    createDiscoveryRoutes: vi.fn(),
    buildServer: vi.fn(),
}));

vi.mock("../auth/better-auth", () => ({
    auth: {
        options: { baseURL: "http://localhost:4000", basePath: "/api/auth" },
    },
    mcpResourceUrl: "http://localhost:4000/mcp",
    oauthResourceClient: {},
}));
vi.mock("@codelitdev/oauth-server-kit/mcp", () => ({
    createMcpOAuthDiscoveryRoutes: mocks.createDiscoveryRoutes,
}));
vi.mock("../auth/middleware", () => ({
    mcpAuth: vi.fn((req: any, _res: any, next: any) => {
        req.authKind = "apikey";
        req.apiKeyId = "key-test";
        req.teamId = "team-1";
        next();
    }),
}));
vi.mock("../auth/require-team", () => ({
    requireTeam: vi.fn((_req, _res, next) => next()),
}));
vi.mock("./server", () => ({
    buildMcpServer: () => mocks.buildServer(),
}));

type ListeningApp = {
    origin: string;
    close(): Promise<void>;
};

const listeningApps: ListeningApp[] = [];
const clients: Client[] = [];
let routes: Router;

async function listen(app: express.Express): Promise<ListeningApp> {
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const { port } = server.address() as AddressInfo;
    const instance = {
        origin: `http://127.0.0.1:${port}`,
        close: () =>
            new Promise<void>((resolve, reject) =>
                server.close((error) => (error ? reject(error) : resolve())),
            ),
    };
    listeningApps.push(instance);
    return instance;
}

afterEach(async () => {
    await Promise.allSettled(clients.splice(0).map((client) => client.close()));
    await Promise.allSettled(listeningApps.splice(0).map((app) => app.close()));
});

describe("MCP Streamable HTTP route", () => {
    beforeAll(async () => {
        mocks.buildServer.mockImplementation(
            () => new McpServer({ name: "FrontLit Test", version: "2.0.0" }),
        );
        mocks.createDiscoveryRoutes.mockImplementation(() => {
            const discovery = Router();
            discovery.get(
                "/.well-known/oauth-protected-resource/mcp",
                (_req, res) =>
                    res.json({ resource: "http://localhost:4000/mcp" }),
            );
            return discovery;
        });
        routes = ((await import("./routes.js")) as any).default;
    });

    beforeEach(() => {
        mocks.buildServer.mockClear();
    });

    async function createApp(trustProxy = false) {
        const app = express();
        app.set("trust proxy", trustProxy ? 1 : false);
        app.use(routes);
        return listen(app);
    }

    it("publishes protected-resource metadata with every enforced scope", async () => {
        const listening = await createApp();
        const response = await fetch(
            `${listening.origin}/.well-known/oauth-protected-resource/mcp`,
        );

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({
            resource: "http://localhost:4000/mcp",
        });
        expect(mocks.createDiscoveryRoutes).toHaveBeenCalledWith(
            expect.objectContaining({
                resourceUrl: "http://localhost:4000/mcp",
                allowedOrigins: "*",
                scopesSupported: expect.arrayContaining([
                    "pages:read",
                    "articles:write",
                    "documentation:read",
                    "product-updates:write",
                    "broadcasts:send",
                    "api_keys:write",
                    "domains:write",
                ]),
            }),
        );
        const options = mocks.createDiscoveryRoutes.mock.calls[0]?.[0];
        expect(options.scopesSupported).not.toEqual(
            expect.arrayContaining([
                "blogs:write",
                "docs:read",
                "changelogs:write",
            ]),
        );
    });

    it("connects a client pinned to the modern protocol", async () => {
        const listening = await createApp();
        const client = new Client(
            { name: "route-test", version: "1.0.0" },
            { versionNegotiation: { mode: { pin: "2026-07-28" } } },
        );
        clients.push(client);
        const transport = new StreamableHTTPClientTransport(
            new URL(`${listening.origin}/mcp`),
            {
                requestInit: {
                    headers: { "x-frontlit-apikey": "fl_live_test" },
                },
            },
        );

        await client.connect(transport);
        expect(client.getProtocolEra()).toBe("modern");
        expect(mocks.buildServer).toHaveBeenCalled();
    });

    it("serves the older initialize handshake statelessly", async () => {
        const listening = await createApp();
        const response = await fetch(`${listening.origin}/mcp`, {
            method: "POST",
            headers: {
                accept: "application/json, text/event-stream",
                "content-type": "application/json",
                "x-frontlit-apikey": "fl_live_test",
            },
            body: JSON.stringify({
                jsonrpc: "2.0",
                id: 1,
                method: "initialize",
                params: {
                    protocolVersion: "2025-11-25",
                    capabilities: {},
                    clientInfo: { name: "legacy", version: "1.0.0" },
                },
            }),
        });

        expect(response.ok).toBe(true);
        expect(response.headers.has("mcp-session-id")).toBe(false);
        expect(response.headers.get("content-type")).toContain(
            "text/event-stream",
        );
        await expect(response.text()).resolves.toContain(
            '"protocolVersion":"2025-11-25"',
        );
    });

    it("does not expose standalone SSE", async () => {
        const listening = await createApp();
        const response = await fetch(`${listening.origin}/mcp`, {
            headers: { "x-frontlit-apikey": "fl_live_test" },
        });
        expect(response.status).toBe(404);
    });

    it("rejects non-JSON bodies before protocol dispatch", async () => {
        const listening = await createApp();
        const response = await fetch(`${listening.origin}/mcp`, {
            method: "POST",
            headers: {
                accept: "application/json",
                "content-type": "text/plain",
                "x-frontlit-apikey": "fl_live_test",
            },
            body: "not an MCP envelope",
        });
        expect(response.status).toBe(415);
        expect(mocks.buildServer).not.toHaveBeenCalled();
    });

    it("allows modern headers in browser preflight without session headers", async () => {
        const listening = await createApp();
        const response = await fetch(`${listening.origin}/mcp`, {
            method: "OPTIONS",
            headers: {
                origin: "https://client.example",
                "access-control-request-method": "POST",
                "access-control-request-headers":
                    "mcp-protocol-version,mcp-method,mcp-name,authorization",
            },
        });

        expect(response.status).toBe(204);
        expect(response.headers.get("access-control-allow-origin")).toBe(
            "https://client.example",
        );
        const allowed =
            response.headers.get("access-control-allow-headers") || "";
        expect(allowed).toContain("MCP-Protocol-Version");
        expect(allowed).toContain("Mcp-Method");
        expect(allowed).toContain("Mcp-Name");
        expect(allowed).not.toContain("Mcp-Session-Id");
    });

    it("accepts forwarded client addresses when the deployment trusts one proxy", async () => {
        const listening = await createApp(true);
        const response = await fetch(`${listening.origin}/mcp`, {
            method: "POST",
            headers: {
                accept: "application/json, text/event-stream",
                "content-type": "application/json",
                "x-forwarded-for": "203.0.113.20",
                "x-frontlit-apikey": "fl_live_test",
            },
            body: JSON.stringify({
                jsonrpc: "2.0",
                id: 1,
                method: "initialize",
                params: {
                    protocolVersion: "2025-11-25",
                    capabilities: {},
                    clientInfo: { name: "proxy-test", version: "1.0.0" },
                },
            }),
        });
        expect(response.status).toBe(200);
    });
});
