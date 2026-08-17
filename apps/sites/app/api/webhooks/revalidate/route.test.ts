import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { revalidateTag } = vi.hoisted(() => ({ revalidateTag: vi.fn() }));
vi.mock("next/cache", () => ({ revalidateTag }));

import { hostCache } from "@/lib/host";
import { POST } from "./route";

function sign(secret: string, body: string, timestamp: number): string {
    return createHmac("sha256", secret)
        .update(`${timestamp}.${body}`)
        .digest("hex");
}

describe("revalidate webhook host-cache invalidation", () => {
    const secret = "test-revalidate-secret";

    beforeEach(() => {
        process.env.REVALIDATE_WEBHOOK_SECRET = secret;
        revalidateTag.mockReset();
        hostCache.delete("acme.localhost");
        hostCache.delete("www.example.com");
        hostCache.delete("other.localhost");
    });

    afterEach(() => {
        delete process.env.REVALIDATE_WEBHOOK_SECRET;
    });

    it("drops listed hosts from the process-wide proxy cache and still revalidates the ISR tag", async () => {
        hostCache.set("acme.localhost", {
            teamId: "team_abc",
            canonicalHost: "www.example.com",
        });
        hostCache.set("www.example.com", {
            teamId: "team_abc",
            canonicalHost: "www.example.com",
        });
        hostCache.set("other.localhost", {
            teamId: "team_other",
            canonicalHost: "other.localhost",
        });

        const body = JSON.stringify({
            teamId: "team_abc",
            invalidateHosts: ["acme.localhost:3002", "www.example.com"],
        });
        const timestamp = Date.now();
        const response = await POST(
            new Request("http://sites.test/api/webhooks/revalidate", {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    "x-frontlit-timestamp": String(timestamp),
                    "x-frontlit-signature": sign(secret, body, timestamp),
                },
                body,
            }),
        );

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ revalidated: true });
        expect(revalidateTag).toHaveBeenCalledWith("team:team_abc", {
            expire: 0,
        });
        expect(hostCache.get("acme.localhost")).toBeUndefined();
        expect(hostCache.get("www.example.com")).toBeUndefined();
        expect(hostCache.get("other.localhost")).toEqual({
            teamId: "team_other",
            canonicalHost: "other.localhost",
        });
    });
});
