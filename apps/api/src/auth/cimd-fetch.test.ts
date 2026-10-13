import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchNodeClientMetadataResource: vi.fn(),
}));

vi.mock("@better-auth/cimd/node", () => ({
  fetchClientMetadataResource: mocks.fetchNodeClientMetadataResource,
}));

import { fetchClientMetadataResource } from "./cimd-fetch";

describe("CIMD client compatibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function mockDocument(metadata: Record<string, unknown>) {
    mocks.fetchNodeClientMetadataResource.mockResolvedValue(
      Response.json(metadata, {
        headers: { "content-length": "999" },
      }),
    );
  }

  it("removes only VS Code's unsupported device grant", async () => {
    mockDocument({
      client_name: "Visual Studio Code",
      grant_types: [
        "authorization_code",
        "refresh_token",
        "urn:ietf:params:oauth:grant-type:device_code",
      ],
    });

    const response = await fetchClientMetadataResource(
      "https://vscode.dev/oauth/client-metadata.json",
    );

    expect(mocks.fetchNodeClientMetadataResource).toHaveBeenCalledOnce();
    expect(response.headers.has("content-length")).toBe(false);
    await expect(response.json()).resolves.toMatchObject({
      grant_types: ["authorization_code", "refresh_token"],
    });
  });

  it("removes only Claude's unsupported JWT bearer grant", async () => {
    mockDocument({
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

    await expect(response.json()).resolves.toMatchObject({
      grant_types: ["authorization_code", "refresh_token"],
    });
  });

  it("passes other clients and non-success responses through unchanged", async () => {
    mockDocument({
      grant_types: [
        "authorization_code",
        "urn:ietf:params:oauth:grant-type:device_code",
      ],
    });
    const clientResponse = await fetchClientMetadataResource(
      "https://client.example/metadata.json",
    );
    expect(clientResponse).toBe(
      await mocks.fetchNodeClientMetadataResource.mock.results[0].value,
    );

    const errorResponse = new Response("unavailable", { status: 503 });
    mocks.fetchNodeClientMetadataResource.mockResolvedValue(errorResponse);
    expect(
      await fetchClientMetadataResource(
        "https://vscode.dev/oauth/client-metadata.json",
      ),
    ).toBe(errorResponse);
  });

  it("preserves a known client's metadata without grant declarations", async () => {
    mockDocument({ client_name: "Visual Studio Code" });

    const response = await fetchClientMetadataResource(
      "https://vscode.dev/oauth/client-metadata.json",
    );

    await expect(response.json()).resolves.toEqual({
      client_name: "Visual Studio Code",
    });
  });

  it("caps metadata before applying client compatibility rules", async () => {
    mocks.fetchNodeClientMetadataResource.mockResolvedValue(
      Response.json({ client_name: "x".repeat(6_000) }),
    );

    await expect(
      fetchClientMetadataResource("https://vscode.dev/oauth/client-metadata.json"),
    ).rejects.toThrow("too large");
  });
});
