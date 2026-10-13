import { afterEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
const signWebhookPayload = (secret: string, raw: string, timestamp: number) =>
  createHmac("sha256", secret).update(`${timestamp}.${raw}`).digest("hex");
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));
import { revalidateTag } from "next/cache";
import { POST } from "./route";
const secret = "docs-test-secret";
const event = {
  eventId: "evt_abc123",
  type: "activation",
  teamId: "team_abc123",
  publicationId: "pub_abc123",
  policyEpoch: 0,
};
function request(body: unknown, timestamp = Date.now(), signature?: string) {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  return new Request("http://site.test/api/webhooks/documentation", {
    method: "POST",
    body: raw,
    headers: {
      "x-frontlit-timestamp": String(timestamp),
      "x-frontlit-signature": signature ?? signWebhookPayload(secret, raw, timestamp),
    },
  });
}
afterEach(() => {
  delete process.env.REVALIDATE_WEBHOOK_SECRET;
  vi.clearAllMocks();
});
describe("DM-DELIVERY signed documentation events", () => {
  it("rejects unconfigured, forged and expired requests", async () => {
    expect((await POST(request(event))).status).toBe(404);
    process.env.REVALIDATE_WEBHOOK_SECRET = secret;
    expect((await POST(request(event, Date.now(), "0".repeat(64)))).status).toBe(401);
    expect((await POST(request(event, Date.now() - 600000))).status).toBe(401);
    expect(revalidateTag).not.toHaveBeenCalled();
  });
  it("rejects malformed payloads, unknown event types and arbitrary tag inputs", async () => {
    process.env.REVALIDATE_WEBHOOK_SECRET = secret;
    expect((await POST(request("not-json"))).status).toBe(400);
    expect(
      (await POST(request({ ...event, type: "purge_any_tag", tag: "everything" })))
        .status,
    ).toBe(400);
    expect((await POST(request({ ...event, teamId: "*" }))).status).toBe(400);
    expect(revalidateTag).not.toHaveBeenCalled();
  });
  it("acknowledges exact replay idempotently and rejects conflicting replay (V31)", async () => {
    process.env.REVALIDATE_WEBHOOK_SECRET = secret;
    expect((await POST(request(event))).status).toBe(200);
    expect((await POST(request(event))).status).toBe(200);
    expect(revalidateTag).toHaveBeenCalledTimes(1);
    expect(revalidateTag).toHaveBeenCalledWith("team:team_abc123", { expire: 0 });
    expect((await POST(request({ ...event, policyEpoch: 1 }))).status).toBe(409);
  });
});
