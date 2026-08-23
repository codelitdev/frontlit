import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const hasServerSession = vi.fn();

vi.mock("@/lib/server-session", () => ({ hasServerSession }));

function request() {
    return new NextRequest("http://localhost:3000/api/proxy/email/templates");
}

describe("API proxy authentication markers", () => {
    beforeEach(() => {
        vi.resetModules();
        vi.unstubAllGlobals();
        hasServerSession.mockReset();
    });

    it("marks a failed local session check as session expiry", async () => {
        hasServerSession.mockResolvedValue(false);
        const { GET } = await import("./route");

        const response = await GET(request(), {
            params: Promise.resolve({ path: ["email", "templates"] }),
        });

        expect(response.status).toBe(401);
        expect(response.headers.get("X-Auth-Error")).toBe("session_expired");
    });

    it("does not relabel an upstream 401 as session expiry", async () => {
        hasServerSession.mockResolvedValue(true);
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue(
                new Response(JSON.stringify({ error: "unauthorized" }), {
                    status: 401,
                    headers: { "Content-Type": "application/json" },
                }),
            ),
        );
        const { GET } = await import("./route");

        const response = await GET(request(), {
            params: Promise.resolve({ path: ["email", "templates"] }),
        });

        expect(response.status).toBe(401);
        expect(response.headers.get("X-Auth-Error")).toBeNull();
    });
});
