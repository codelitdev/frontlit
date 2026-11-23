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

  async function call(
    client: Client,
    name: string,
    args: Record<string, unknown> = {},
  ) {
    const result = await client.callTool({ name, arguments: args });
    expect(result.isError, JSON.stringify(result.content)).not.toBe(true);
    return {
      text: (result.content as any[])[0].text as string,
      data: result.structuredContent as any,
    };
  }

  it("lists pages as small summaries with status, in pages of results", async () => {
    const client = await connect();
    const big = "x".repeat(200_000);
    const shared = (name: string) => ({
      widgetId: `${name}-1`,
      name,
      deletable: false,
      moveable: false,
      shared: true,
    });
    const ids: string[] = [];
    for (const name of ["Live", "Edited", "Unpublished"]) {
      const { data } = await call(client, "create_page", { name });
      ids.push(data.pageId);
      await call(client, "update_page", {
        pageId: data.pageId,
        robotsAllowed: name !== "Unpublished",
        layout: [
          shared("header"),
          {
            widgetId: `embed-${name}`,
            name: "embed",
            deletable: true,
            moveable: true,
            shared: false,
            settings: { contentType: "script", content: `<div>${big}</div>` },
          },
          shared("footer"),
        ],
      });
    }
    await call(client, "publish_page", { pageId: ids[0] });
    await call(client, "publish_page", { pageId: ids[1] });
    await call(client, "update_page", { pageId: ids[1], title: "Changed" });

    const all = await call(client, "list_pages");
    expect(all.text.length).toBeLessThan(2_000);
    expect(all.data.total).toBe(3);
    const byName = Object.fromEntries(
      all.data.items.map((item: any) => [item.name, item]),
    );
    expect(byName.Live).toMatchObject({
      status: "published",
      robotsAllowed: true,
      draftRobotsAllowed: true,
    });
    expect(byName.Live.publishedAt).toEqual(expect.any(String));
    expect(byName.Edited).toMatchObject({ status: "published_with_changes" });
    expect(byName.Unpublished).toMatchObject({
      status: "draft",
      publishedAt: null,
      robotsAllowed: null,
      draftRobotsAllowed: false,
    });

    const first = await call(client, "list_pages", { itemsPerPage: 2 });
    const second = await call(client, "list_pages", { itemsPerPage: 2, page: 2 });
    expect(first.data.items).toHaveLength(2);
    expect(second.data.items).toHaveLength(1);
    expect(second.data.total).toBe(3);
  });

  it.each(["article", "documentation_page", "product_update"])(
    "lists %ss as small summaries with status",
    async (label) => {
      const client = await connect();
      for (const title of ["First", "Second"])
        await call(client, `create_${label}`, {
          title,
          markdown: "Long paragraph. ".repeat(20_000),
        });

      const listed = await call(client, `list_${label}s`);
      expect(listed.text.length).toBeLessThan(1_000);
      expect(listed.data.total).toBe(2);
      expect(listed.data.items[0]).toEqual({
        documentId: expect.any(String),
        title: "Second",
        slug: "second",
        status: "draft",
        publishedAt: null,
        updatedAt: expect.any(String),
      });
      const paged = await call(client, `list_${label}s`, { itemsPerPage: 1, page: 2 });
      expect(paged.data.items.map((item: any) => item.title)).toEqual(["First"]);
    },
  );

  it.each(["article", "product_update"])(
    "shows a published %s's status in the list",
    async (label) => {
      const client = await connect();
      const { data } = await call(client, `create_${label}`, { title: "Live" });
      await call(client, `publish_${label}`, { documentId: data.documentId });
      const before = await call(client, `list_${label}s`);
      expect(before.data.items[0]).toMatchObject({
        status: "published",
        publishedAt: expect.any(String),
      });
      await call(client, `update_${label}`, {
        documentId: data.documentId,
        title: "Live, edited",
      });
      const after = await call(client, `list_${label}s`);
      expect(after.data.items[0]).toMatchObject({
        title: "Live, edited",
        status: "published_with_changes",
      });
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
