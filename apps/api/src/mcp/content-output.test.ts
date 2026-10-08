import { afterEach, describe, expect, it, vi } from "vitest";
import { makeTestDb, seedTeam, type TestDb } from "../test/db";

vi.mock("../db/client", async () => ({ db: await makeTestDb(), pool: {} }));

import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { createMcpHandler, type AuthInfo } from "@modelcontextprotocol/server";
import { db as appDb } from "../db/client";
import { buildMcpServer } from "./server";

const db = appDb as unknown as TestDb;
const closeables: Array<{ close(): Promise<void> }> = [];
afterEach(async () => {
  await Promise.allSettled(closeables.splice(0).map((item) => item.close()));
});

// Handler-level tests bypass SDK output validation; these calls go through the
// actual MCP SDK so a projection that drifts from its declared output schema
// fails here instead of turning successful writes into protocol errors.
describe("typed content tools through the MCP SDK", () => {
  async function connect() {
    const { team } = await seedTeam(db);
    const authInfo: AuthInfo = {
      token: "key-test",
      clientId: "api-key:key-test",
      scopes: [],
      extra: { authKind: "api_key", teamId: team.id, account: null },
    };
    const handler = createMcpHandler(() => buildMcpServer(), { legacy: "stateless" });
    const client = new Client({ name: "content-output", version: "1" });
    closeables.push(client, handler);
    await client.connect(
      new StreamableHTTPClientTransport(new URL("http://frontlit.test/mcp"), {
        fetch: (input, init) =>
          handler.fetch(new Request(input as any, init), { authInfo }),
      }),
    );
    return client;
  }

  it.each(["article", "documentation_page", "product_update"])(
    "creates, updates and reads a %s with schema-valid output",
    async (label) => {
      const client = await connect();
      const created = await client.callTool({
        name: `create_${label}`,
        arguments: { title: "Example" },
      });
      expect(created.isError).not.toBe(true);
      const documentId = (created.structuredContent as any).documentId;
      expect(created.structuredContent).not.toHaveProperty("authorAccountId");
      const updated = await client.callTool({
        name: `update_${label}`,
        arguments: {
          documentId,
          title: "Updated",
          ...(label === "documentation_page" ? { expectedDraftVersion: 1 } : {}),
        },
      });
      expect(updated.isError).not.toBe(true);
      expect(updated.structuredContent).toMatchObject({ draftTitle: "Updated" });
      const read = await client.callTool({
        name: `get_${label}`,
        arguments: { documentId },
      });
      expect(read.isError).not.toBe(true);
      expect(read.structuredContent).not.toHaveProperty("authorAccountId");
      const listed = await client.callTool({ name: `list_${label}s`, arguments: {} });
      expect(listed.isError).not.toBe(true);
      expect(listed.structuredContent).toMatchObject({ total: 1 });
    },
  );

  it("returns schema-valid output from every read-only tool without required input", async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    const invalid: string[] = [];
    for (const tool of tools) {
      if (!tool.annotations?.readOnlyHint || (tool.inputSchema as any).required?.length)
        continue;
      const result = await client.callTool({ name: tool.name, arguments: {} });
      if (result.isError && /output validation/i.test(JSON.stringify(result.content)))
        invalid.push(tool.name);
    }
    expect(invalid).toEqual([]);
  }, 60_000);
});
