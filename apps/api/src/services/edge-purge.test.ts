import { afterEach, describe, expect, it, vi } from "vitest";
import { signWebhookPayload } from "./webhook-signing";
import {
  deliverEdgePurge,
  edgeDestinations,
  edgePurgeAdapter,
  NotYetDue,
} from "./edge-purge";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  delete process.env.EDGE_PURGE_URL;
  delete process.env.EDGE_PURGE_SECRET;
  delete process.env.EDGE_PURGE_ADAPTER;
  delete process.env.CLOUDFLARE_ZONE_ID;
  delete process.env.CLOUDFLARE_API_TOKEN;
});

function configure() {
  process.env.EDGE_PURGE_URL = "http://purge.test/purge";
  process.env.EDGE_PURGE_SECRET = "edge-secret";
}

describe("edge purge", () => {
  it("is off until a purge URL and secret are set", () => {
    expect(edgePurgeAdapter()).toBeNull();
    expect(edgeDestinations()).toEqual([]);
    configure();
    expect(edgeDestinations()).toEqual(["edge", "edge-repeat"]);
  });

  it("records purges for a broken configuration and fails their delivery", async () => {
    process.env.EDGE_PURGE_ADAPTER = "nope";
    expect(edgeDestinations()).toEqual(["edge", "edge-repeat"]);
    expect(() => edgePurgeAdapter()).toThrow(/Unknown EDGE_PURGE_ADAPTER/);
    await expect(
      deliverEdgePurge("edge", { createdAt: new Date() }, "team_a", ["docs:team_a"]),
    ).rejects.toThrow(/Unknown EDGE_PURGE_ADAPTER/);
  });

  it("posts the tags signed with the edge secret", async () => {
    configure();
    const fetchMock = vi.fn(
      async (_url: string | URL, _init?: RequestInit) => new Response("ok"),
    );
    vi.stubGlobal("fetch", fetchMock);
    await deliverEdgePurge("edge", { createdAt: new Date() }, "team_a", [
      "docs:team_a",
    ]);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("http://purge.test/purge");
    const body = String(init?.body);
    expect(JSON.parse(body)).toEqual({ teamId: "team_a", tags: ["docs:team_a"] });
    const headers = init?.headers as Record<string, string>;
    expect(headers["x-frontlit-signature"]).toBe(
      signWebhookPayload("edge-secret", body, Number(headers["x-frontlit-timestamp"])),
    );
  });

  it("fails (so the outbox retries) when the receiver rejects", async () => {
    configure();
    vi.stubGlobal("fetch", async () => new Response("no", { status: 502 }));
    await expect(
      deliverEdgePurge("edge", { createdAt: new Date() }, "team_a", ["docs:team_a"]),
    ).rejects.toThrow(/502/);
  });

  it("holds the second purge until ten seconds after the event", async () => {
    configure();
    const fetchMock = vi.fn(async () => new Response("ok"));
    vi.stubGlobal("fetch", fetchMock);
    const createdAt = new Date();
    await expect(
      deliverEdgePurge("edge-repeat", { createdAt }, "team_a", ["docs:team_a"]),
    ).rejects.toBeInstanceOf(NotYetDue);
    expect(fetchMock).not.toHaveBeenCalled();
    vi.useFakeTimers({ now: createdAt.getTime() + 10_001 });
    await deliverEdgePurge("edge-repeat", { createdAt }, "team_a", ["docs:team_a"]);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

describe("cloudflare adapter", () => {
  function configureCloudflare() {
    process.env.EDGE_PURGE_ADAPTER = "cloudflare";
    process.env.CLOUDFLARE_ZONE_ID = "zone123";
    process.env.CLOUDFLARE_API_TOKEN = "cf-token";
  }

  it("purges tags in batches of 30 with the API token", async () => {
    configureCloudflare();
    const fetchMock = vi.fn(
      async (_url: string | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ success: true }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const tags = Array.from({ length: 45 }, (_, i) => `page:team_a:p${i}`);
    await deliverEdgePurge("edge", { createdAt: new Date() }, "team_a", tags);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.cloudflare.com/client/v4/zones/zone123/purge_cache");
    expect((init?.headers as Record<string, string>).authorization).toBe(
      "Bearer cf-token",
    );
    expect(JSON.parse(String(init?.body)).tags).toHaveLength(30);
    expect(JSON.parse(String(fetchMock.mock.calls[1]![1]?.body)).tags).toHaveLength(15);
  });

  it("fails on an unsuccessful API answer so the outbox retries", async () => {
    configureCloudflare();
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(
          JSON.stringify({ success: false, errors: [{ message: "rate limited" }] }),
          {
            status: 429,
          },
        ),
    );
    await expect(
      deliverEdgePurge("edge", { createdAt: new Date() }, "team_a", ["docs:team_a"]),
    ).rejects.toThrow(/rate limited/);
  });

  it("is off until the zone and token are set", () => {
    process.env.EDGE_PURGE_ADAPTER = "cloudflare";
    expect(edgePurgeAdapter()).toBeNull();
    configureCloudflare();
    expect(edgePurgeAdapter()).not.toBeNull();
  });
});
