import { describe, expect, it, vi } from "vitest";
import { contract } from "@frontlit/api-contract";

vi.mock("../db/client", () => ({ db: {}, pool: {} }));
vi.mock("./better-auth", () => ({
    authBaseUrl: "http://localhost:4000",
    mcpResourceUrl: "http://localhost:4000/mcp",
    webClientUrl: "http://localhost:3000",
}));

import { getRestOperationPolicy, listRestOperations } from "./operation-policy";
import { authorizeRestOperation } from "./authorize";
import { listMcpToolPolicies } from "../mcp/policy";

function collectContractOperations(node: unknown, prefix = ""): string[] {
    if (!node || typeof node !== "object") return [];
    const keys: string[] = [];
    for (const [name, value] of Object.entries(
        node as Record<string, unknown>,
    )) {
        if (!value || typeof value !== "object") continue;
        if ("method" in value && "path" in value) {
            keys.push(`${prefix}${name}`);
        } else {
            keys.push(...collectContractOperations(value, `${prefix}${name}.`));
        }
    }
    return keys;
}

const OUTSIDE_REGISTRY = new Set(["public", "provisioning"]);

describe("fail-closed operation policy coverage", () => {
    it("registers every protected REST contract operation", () => {
        const protectedOps = collectContractOperations(contract).filter(
            (key) => !OUTSIDE_REGISTRY.has(key.split(".")[0] ?? ""),
        );
        const missing = protectedOps.filter(
            (operation) => getRestOperationPolicy(operation) === null,
        );
        expect(missing).toEqual([]);
        expect(protectedOps.length).toBeGreaterThan(50);
        expect(listRestOperations()).toEqual(
            expect.arrayContaining(protectedOps),
        );
    });

    it("keeps public, provisioning, and unregistered operations outside allow-by-default", async () => {
        expect(getRestOperationPolicy("public.getPageBySlug")).toBeNull();
        expect(getRestOperationPolicy("provisioning.provisionTeam")).toBeNull();
        expect(getRestOperationPolicy("health")).toBeNull();
        const denial = await authorizeRestOperation(
            { method: "GET", headers: {} } as any,
            "not.a.real.operation",
        );
        expect(denial).toMatchObject({
            status: 403,
            body: { error: "insufficient_permission" },
        });
    });

    it("registers every MCP tool with an explicit policy", () => {
        const policies = listMcpToolPolicies();
        expect(Object.keys(policies).length).toBe(91);
        for (const policy of Object.values(policies)) {
            expect(policy.oauthScope || policy.scope).toBeTruthy();
            expect(["allow", "deny"]).toContain(policy.apiKeyAccess);
            expect(policy.human.kind).toBeTruthy();
        }
    });
});
