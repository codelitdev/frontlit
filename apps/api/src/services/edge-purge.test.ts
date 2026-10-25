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
