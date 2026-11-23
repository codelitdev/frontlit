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

  it("lists pages as small summaries with status, filtering and paging", async () => {
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
    for (const name of ["Live", "Edited", "Hidden"]) {
      const { data } = await call(client, "create_page", { name });
      ids.push(data.pageId);
      await call(client, "update_page", {
        pageId: data.pageId,
        robotsAllowed: name !== "Hidden",
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
    const [live, edited] = ids;
    await call(client, "publish_page", { pageId: live });
    await call(client, "publish_page", { pageId: edited });
    await call(client, "update_page", { pageId: edited, title: "Changed" });

    const all = await call(client, "list_pages");
    expect(all.text.length).toBeLessThan(5_000);
    expect(all.data.total).toBe(3);
    expect(all.data.nextCursor).toBeNull();
    expect(all.data.sharedHeaderFooterHasUnpublishedChanges).toBe(false);
    expect(Object.keys(all.data.items[0]).slice(0, 4)).toEqual([
      "pageId",
      "name",
      "slug",
      "status",
    ]);
    expect(all.data.items[0]).not.toHaveProperty("draftLayout");
    const byName = Object.fromEntries(
      all.data.items.map((item: any) => [item.name, item]),
    );
    expect(byName.Live).toMatchObject({
      status: "published",
      hasUnpublishedChanges: false,
      robotsAllowed: true,
    });
    expect(byName.Live.publishedAt).toEqual(expect.any(String));
    expect(byName.Edited).toMatchObject({
      status: "published_with_changes",
      hasUnpublishedChanges: true,
    });
    expect(byName.Hidden).toMatchObject({
      status: "draft",
      publishedAt: null,
      hasUnpublishedChanges: true,
      robotsAllowed: null,
      draftRobotsAllowed: false,
    });

    const drafts = await call(client, "list_pages", { status: "draft" });
    expect(drafts.data.items.map((item: any) => item.name)).toEqual(["Hidden"]);
    expect(drafts.data.total).toBe(1);

    const first = await call(client, "list_pages", { limit: 2 });
    expect(first.data.items).toHaveLength(2);
    expect(first.data.nextCursor).toBe("2");
    const rest = await call(client, "list_pages", { limit: 2, cursor: "2" });
    expect(rest.data.items).toHaveLength(1);
    expect(rest.data.nextCursor).toBeNull();

    const body = await call(client, "list_pages", { include: "body", limit: 1 });
    expect(body.data.items[0].draftLayout).toEqual(expect.any(Array));
    expect(Object.keys(body.data.items[0])[3]).toBe("status");

    // A shared header edit is reported once, not as changes on every page.
    await call(client, "update_page", {
      pageId: edited,
      layout: [
        { ...shared("header"), settings: { ctaLabel: "New" } },
        shared("footer"),
      ],
    });
    const chrome = await call(client, "list_pages", { status: "published" });
    expect(chrome.data.items.map((item: any) => item.name)).toEqual(["Live"]);
    expect(chrome.data.sharedHeaderFooterHasUnpublishedChanges).toBe(true);
  });

  it.each(["article", "documentation_page", "product_update"])(
    "lists %ss as summaries without bodies",
    async (label) => {
      const client = await connect();
      const ids: string[] = [];
      for (const title of ["Live", "Draft"]) {
        const { data } = await call(client, `create_${label}`, {
          title,
          markdown: `${"Long paragraph. ".repeat(20_000)}`,
        });
        ids.push(data.documentId);
      }
      let docArgs = {};
      if (label === "documentation_page") {
        const { data: settings } = await call(client, "get_documentation_settings");
        docArgs = {
          expectedDraftVersion: 1,
          expectedDocsDraftVersion: settings.draftVersion,
          expectedPublicationId: settings.activePublicationId ?? null,
        };
      }
      await call(client, `publish_${label}`, { documentId: ids[0], ...docArgs });

      const all = await call(client, `list_${label}s`);
      expect(all.text.length).toBeLessThan(3_000);
      expect(all.data.total).toBe(2);
      expect(all.data.items[0]).not.toHaveProperty("draftContent");
      const byTitle = Object.fromEntries(
        all.data.items.map((item: any) => [item.draftTitle, item]),
      );
      expect(byTitle.Live).toMatchObject({
        status: "published",
        title: "Live",
        hasUnpublishedChanges: false,
      });
      expect(byTitle.Draft).toMatchObject({
        status: "draft",
        title: null,
        publishedAt: null,
        hasUnpublishedChanges: true,
      });

      const drafts = await call(client, `list_${label}s`, { status: "draft" });
      expect(drafts.data.items.map((item: any) => item.draftTitle)).toEqual(["Draft"]);

      const body = await call(client, `list_${label}s`, { include: "body", limit: 1 });
      expect(body.data.items[0].draftContent).toEqual(expect.any(Object));
      expect(body.data.nextCursor).toBe("1");
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
