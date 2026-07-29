import express from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getProtectedResourceMetadata: vi.fn(),
}));

vi.mock("../auth/better-auth", () => ({
    auth: {},
    mcpResourceUrl: "http://localhost:4000/mcp",
    oauthResourceClient: {
        getActions: () => ({
            getProtectedResourceMetadata:
                mocks.getProtectedResourceMetadata,
        }),
    },
}));
vi.mock("../auth/middleware", () => ({
    mcpAuth: (_req: any, _res: any, next: () => void) => next(),
}));
vi.mock("../auth/require-team", () => ({
    requireTeam: (_req: any, _res: any, next: () => void) => next(),
}));
vi.mock("./server", () => ({ createMCPSession: vi.fn() }));

async function request(app: express.Express, path: string) {
    const server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No port");
    try {
        return await fetch(`http://127.0.0.1:${address.port}${path}`);
    } finally {
        await new Promise<void>((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve())),
        );
    }
}

describe("MCP OAuth discovery", () => {
    let app: express.Express;

    beforeEach(async () => {
        vi.clearAllMocks();
        vi.resetModules();
        const routes = ((await import("./routes.js")) as any).default;
        app = express();
        app.use(routes);
    });

    it("serves protected-resource metadata at the RFC 9728 MCP path", async () => {
        mocks.getProtectedResourceMetadata.mockResolvedValue({
            resource: "http://localhost:4000/mcp",
            scopes_supported: ["pages:read"],
            bearer_methods_supported: ["header"],
        });

        const response = await request(
            app,
            "/.well-known/oauth-protected-resource/mcp",
        );
        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({
            resource: "http://localhost:4000/mcp",
        });
        expect(mocks.getProtectedResourceMetadata).toHaveBeenCalledWith(
            expect.objectContaining({
                resource: "http://localhost:4000/mcp",
                bearer_methods_supported: ["header"],
            }),
            { silenceWarnings: { oidcScopes: true } },
        );
    });
});
