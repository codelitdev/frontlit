import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { revalidateTag } = vi.hoisted(() => ({ revalidateTag: vi.fn() }));
vi.mock("next/cache", () => ({ revalidateTag }));

import { hostCache } from "@/lib/host";
import { POST } from "./route";

const secret = "test-revalidate-secret";

function request(payload: unknown) {
  const body = typeof payload === "string" ? payload : JSON.stringify(payload);
  const timestamp = Date.now();
  return new Request("http://sites.test/api/webhooks/revalidate", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-frontlit-timestamp": String(timestamp),
      "x-frontlit-signature": createHmac("sha256", secret)
        .update(`${timestamp}.${body}`)
        .digest("hex"),
    },
    body,
  });
}

let sequence = 0;
const eventId = () => `evt_test${++sequence}`;

describe("revalidate webhook", () => {
  beforeEach(() => {
    process.env.REVALIDATE_WEBHOOK_SECRET = secret;
    revalidateTag.mockReset();
  });

  afterEach(() => {
    delete process.env.REVALIDATE_WEBHOOK_SECRET;
  });

  it("expires each listed tag immediately", async () => {
    const id = eventId();
    const response = await POST(
      request({
        eventId: id,
        teamId: "team_abc",
        tags: ["page:team_abc:pricing", "sitemap:team_abc"],
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ acknowledged: id });
    expect(revalidateTag.mock.calls).toEqual([
      ["page:team_abc:pricing", { expire: 0 }],
      ["sitemap:team_abc", { expire: 0 }],
    ]);
  });

  it("refuses tags of another team or of an unknown family", async () => {
    for (const tags of [
      ["shell:team_other"],
      ["anything:team_abc"],
      ["page:team_abc:a b"],
    ]) {
      const response = await POST(
        request({ eventId: eventId(), teamId: "team_abc", tags }),
      );
      expect(response.status).toBe(400);
    }
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("acknowledges a replay without repeating it and rejects a conflicting one", async () => {
    const event = { eventId: eventId(), teamId: "team_abc", tags: ["blog:team_abc"] };
    expect((await POST(request(event))).status).toBe(200);
    expect((await POST(request(event))).status).toBe(200);
    expect(revalidateTag).toHaveBeenCalledTimes(1);
    expect((await POST(request({ ...event, tags: ["docs:team_abc"] }))).status).toBe(
      409,
    );
  });

  it("rejects a bad signature and a missing secret", async () => {
    const event = { eventId: eventId(), teamId: "team_abc", tags: ["blog:team_abc"] };
    const tampered = request(event);
    tampered.headers.set("x-frontlit-signature", "0".repeat(64));
    expect((await POST(tampered)).status).toBe(401);
    delete process.env.REVALIDATE_WEBHOOK_SECRET;
    expect((await POST(request(event))).status).toBe(404);
  });

  it("drops listed hosts from the proxy's host cache", async () => {
    const acme = {
      teamId: "team_abc",
      canonicalHost: "www.example.com",
      redirect: false,
      hideFromSearch: false,
    };
    hostCache.set("acme.localhost", acme);
    hostCache.set("www.example.com", acme);
    hostCache.set("other.localhost", { ...acme, teamId: "team_other" });

    const response = await POST(
      request({
        eventId: eventId(),
        teamId: "team_abc",
        tags: ["team:team_abc"],
        invalidateHosts: ["acme.localhost:3002", "www.example.com"],
      }),
    );
    expect(response.status).toBe(200);
    expect(hostCache.get("acme.localhost")).toBeUndefined();
    expect(hostCache.get("www.example.com")).toBeUndefined();
    expect(hostCache.get("other.localhost")).toEqual({ ...acme, teamId: "team_other" });
  });
});
