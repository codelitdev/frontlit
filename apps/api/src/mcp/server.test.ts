import { afterEach, describe, expect, it, vi } from "vitest";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import {
    createMcpHandler,
    type AuthInfo,
    type McpHttpHandler,
    type ServerContext,
} from "@modelcontextprotocol/server";
import { buildMcpServer } from "./server";
import { authorizeMcpTool, listMcpToolPolicies, MCP_SCOPES } from "./policy";
import { jsonResult } from "./tools/responses";

vi.mock("../db/client", () => ({ db: {}, pool: {} }));

const endpoint = new URL("http://frontlit.test/mcp");
const apiKeyAuth: AuthInfo = {
    token: "key-test",
    clientId: "api-key:key-test",
    scopes: [],
    extra: {
        authKind: "api_key",
        teamId: "team-1",
        account: null,
    },
};

function createHandler() {
    return createMcpHandler(() => buildMcpServer(), {
        legacy: "stateless",
    });
}

function transportFor(handler: McpHttpHandler, authInfo = apiKeyAuth) {
    return new StreamableHTTPClientTransport(endpoint, {
        fetch: (input, init) =>
            handler.fetch(new Request(input, init), { authInfo }),
    });
}

const closeables: Array<{ close(): Promise<void> }> = [];

afterEach(async () => {
    await Promise.allSettled(closeables.splice(0).map((item) => item.close()));
});

describe("FrontLit MCP server", () => {
    it("serves the complete deterministic tool catalog on 2026-07-28", async () => {
        const handler = createHandler();
        const client = new Client(
            { name: "frontlit-test", version: "1.0.0" },
            { versionNegotiation: { mode: { pin: "2026-07-28" } } },
        );
        closeables.push(client, handler);

        await client.connect(transportFor(handler));
        expect(client.getProtocolEra()).toBe("modern");

        const result = await client.listTools();
        const policyNames = Object.keys(listMcpToolPolicies()).sort();
        expect(result.tools).toHaveLength(89);
        expect(result.tools.map((tool) => tool.name).sort()).toEqual(
            policyNames,
        );
        expect(new Set(result.tools.map((tool) => tool.name)).size).toBe(89);
        expect(result.ttlMs).toBe(300_000);
        expect(result.cacheScope).toBe("private");
        for (const tool of result.tools) {
            expect(tool.description).toBeTruthy();
            expect(tool.inputSchema).toMatchObject({ type: "object" });
            expect(tool.outputSchema).toBeTruthy();
            expect(tool.annotations).toBeTruthy();
        }

        const refreshed = await client.listTools(undefined, {
            cacheMode: "refresh",
        });
        expect(refreshed.tools.map((tool) => tool.name)).toEqual(
            result.tools.map((tool) => tool.name),
        );
    });

    it("rejects modern envelope/header mismatches", async () => {
        const handler = createHandler();
        const client = new Client(
            { name: "frontlit-header-test", version: "1.0.0" },
            { versionNegotiation: { mode: { pin: "2026-07-28" } } },
        );
        closeables.push(client, handler);
        let tamperHeaders = false;
        const transport = new StreamableHTTPClientTransport(endpoint, {
            fetch: (input, init) => {
                const request = new Request(input, init);
                if (!tamperHeaders) {
                    return handler.fetch(request, { authInfo: apiKeyAuth });
                }
                const headers = new Headers(request.headers);
                headers.set("Mcp-Method", "tools/call");
                return handler.fetch(new Request(request, { headers }), {
                    authInfo: apiKeyAuth,
                });
            },
        });

        await client.connect(transport);
        tamperHeaders = true;
        await expect(
            client.listTools(undefined, { cacheMode: "refresh" }),
        ).rejects.toThrow();
    });

    it("enforces OAuth scopes and account-only policy while preserving fixed-team keys", () => {
        const apiKeyContext = {
            mcpReq: {},
            http: { authInfo: apiKeyAuth },
        } as unknown as ServerContext;
        expect(authorizeMcpTool("send_broadcast", apiKeyContext)).toBeNull();
        expect(authorizeMcpTool("list_teams", apiKeyContext)).toMatchObject({
            isError: true,
        });

        const oauthContext = {
            mcpReq: {},
            http: {
                authInfo: {
                    token: "oauth-token",
                    clientId: "client-1",
                    scopes: [MCP_SCOPES.pagesRead],
                    extra: {
                        authKind: "oauth",
                        teamId: "team-1",
                        account: { id: "account-1" },
                    },
                },
            },
        } as unknown as ServerContext;

        expect(authorizeMcpTool("list_pages", oauthContext)).toBeNull();
        expect(authorizeMcpTool("send_broadcast", oauthContext)).toMatchObject({
            isError: true,
            content: [
                expect.objectContaining({
                    text: expect.stringContaining(MCP_SCOPES.broadcastsSend),
                }),
            ],
        });
        expect(() =>
            authorizeMcpTool("unregistered_tool", oauthContext),
        ).toThrow("has no authorization policy");
    });

    it("normalizes nested Date values consistently in text and structured output", () => {
        const createdAt = new Date("2026-08-10T00:00:00.000Z");
        const result = jsonResult({
            item: { createdAt },
            history: [{ updatedAt: createdAt }],
        });

        expect(result.structuredContent).toEqual({
            item: { createdAt: createdAt.toISOString() },
            history: [{ updatedAt: createdAt.toISOString() }],
        });
        expect(JSON.parse(result.content[0].text)).toEqual(
            result.structuredContent,
        );
    });
});
