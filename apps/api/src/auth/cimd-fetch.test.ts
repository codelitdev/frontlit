import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  lookup: vi.fn(),
  request: vi.fn(),
}));

vi.mock("node:dns/promises", () => ({ lookup: mocks.lookup }));
vi.mock("node:https", () => ({ request: mocks.request }));

import { fetchClientMetadataResource } from "./cimd-fetch";

describe("CIMD Node fetcher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function mockMetadataDocument(
    metadata: Record<string, unknown>,
    inspectOptions?: (options: any) => void,
  ) {
    mocks.request.mockImplementation((...args: any[]) => {
      const options = args[1];
      inspectOptions?.(options);
      const response = Object.assign(
        Readable.from([Buffer.from(JSON.stringify(metadata))]),
        {
          statusCode: 200,
          statusMessage: "OK",
          headers: { "content-type": "application/json" },
        },
      );
      queueMicrotask(() => args[2](response));
      return Object.assign(new EventEmitter(), { end: vi.fn() });
    });
  }

  it("pins the full address array for Node 24 lookup(all=true)", async () => {
    const pinnedAddress = { address: "13.107.213.48", family: 4 };
    mocks.lookup.mockResolvedValue([pinnedAddress]);
    let lookupResult: unknown;
    mockMetadataDocument(
      {
        client_name: "Visual Studio Code",
        grant_types: [
          "authorization_code",
          "refresh_token",
          "urn:ietf:params:oauth:grant-type:device_code",
        ],
      },
      (options) =>
        options.lookup(
          "vscode.dev",
          { all: true },
          (_error: unknown, addresses: unknown) => {
            lookupResult = addresses;
          },
        ),
    );

    const response = await fetchClientMetadataResource(
      "https://vscode.dev/oauth/client-metadata.json",
    );

    expect(lookupResult).toEqual([pinnedAddress]);
    await expect(response.json()).resolves.toEqual({
      client_name: "Visual Studio Code",
      grant_types: ["authorization_code", "refresh_token"],
    });
  });

  it("rejects private and reserved DNS answers before connecting", async () => {
    mocks.lookup.mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);
    await expect(
      fetchClientMetadataResource("https://metadata.example/client.json"),
    ).rejects.toThrow("public-routable");
    expect(mocks.request).not.toHaveBeenCalled();

    mocks.lookup.mockResolvedValue([{ address: "192.0.2.1", family: 4 }]);
    await expect(
      fetchClientMetadataResource("https://metadata.example/client.json"),
    ).rejects.toThrow("public-routable");
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("removes only Claude's unsupported JWT bearer grant", async () => {
    mocks.lookup.mockResolvedValue([{ address: "104.18.32.47", family: 4 }]);
    mockMetadataDocument({
      client_id: "https://claude.ai/oauth/mcp-oauth-client-metadata",
      grant_types: [
        "authorization_code",
        "refresh_token",
        "urn:ietf:params:oauth:grant-type:jwt-bearer",
      ],
    });

    const response = await fetchClientMetadataResource(
      "https://claude.ai/oauth/mcp-oauth-client-metadata",
    );
    await expect(response.json()).resolves.toEqual({
      client_id: "https://claude.ai/oauth/mcp-oauth-client-metadata",
      grant_types: ["authorization_code", "refresh_token"],
    });
  });

  it("does not relax grant validation for other CIMD clients", async () => {
    mocks.lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    mockMetadataDocument({
      grant_types: [
        "authorization_code",
        "urn:ietf:params:oauth:grant-type:device_code",
      ],
    });

    const response = await fetchClientMetadataResource(
      "https://client.example/metadata.json",
    );
    await expect(response.json()).resolves.toMatchObject({
      grant_types: [
        "authorization_code",
        "urn:ietf:params:oauth:grant-type:device_code",
      ],
    });
  });

  it("rejects oversized metadata responses", async () => {
    mocks.lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    mocks.request.mockImplementation((...args: any[]) => {
      const response = Object.assign(Readable.from([Buffer.alloc(1_048_577, "a")]), {
        statusCode: 200,
        statusMessage: "OK",
        headers: { "content-type": "application/json" },
      });
      queueMicrotask(() => args[2](response));
      return Object.assign(new EventEmitter(), { end: vi.fn() });
    });

    await expect(
      fetchClientMetadataResource("https://client.example/metadata.json"),
    ).rejects.toThrow("too large");
  });
});
