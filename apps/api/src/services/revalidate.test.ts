import { afterEach, describe, expect, it, vi } from "vitest";
import { signWebhookPayload } from "./webhook-signing";
import { revalidateTeam } from "./revalidate";

describe("revalidateTeam domain host payload", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.REVALIDATE_WEBHOOK_SECRET;
    delete process.env.SITES_BASE_URL;
  });

  it("includes invalidateHosts in the signed webhook body", async () => {
    process.env.REVALIDATE_WEBHOOK_SECRET = "secret";
    process.env.SITES_BASE_URL = "http://sites.test";
    const fetchMock = vi.fn(
      async (_url: string | URL, _init?: RequestInit) => new Response("ok"),
    );
    vi.stubGlobal("fetch", fetchMock);

    await revalidateTeam("team_abc", {
      invalidateHosts: ["acme.localhost", "www.example.com"],
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("http://sites.test/api/webhooks/revalidate");
    const body = String(init?.body);
    expect(JSON.parse(body)).toEqual({
      teamId: "team_abc",
      invalidateHosts: ["acme.localhost", "www.example.com"],
    });
    const headers = init?.headers as Record<string, string>;
    const timestamp = Number(headers["x-frontlit-timestamp"]);
    expect(headers["x-frontlit-signature"]).toBe(
      signWebhookPayload("secret", body, timestamp),
    );
  });
});
