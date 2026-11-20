import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  articleMetaSchema,
  documentationValidationErrorSchema,
  productUpdateMetaSchema,
} from "@frontlit/api-contract";
import { makeTestDb, seedTeam, type TestDb } from "../test/db";

vi.mock("../db/client", async () => ({ db: await makeTestDb() }));
vi.mock("../auth/middleware", () => ({
  requireAuth: (_req: any, _res: any, next: any) => next(),
}));
vi.mock("../auth/require-team", () => ({
  requireTeam: (_req: any, _res: any, next: any) => next(),
}));
vi.mock("../auth/authorize", () => ({
  authorizeHandlers: (handlers: unknown) => handlers,
}));

import { db as testDb } from "../db/client";
import blogsRouter from "./blogs-routes";
import changelogsRouter from "./changelogs-routes";
import { createDocument, getDocumentByDocumentId, updateDocument } from "./queries";
import { registerDocumentTools } from "../mcp/tools/documents";
import { parseDocsMarkdown } from "@frontlit/text-editor/docs";

const db = testDb as unknown as TestDb;
const tools = new Map<string, { config: any; handler: any }>();
const registrar = {
  registerTool: (name: string, config: any, handler: any) => {
    tools.set(name, { config, handler });
  },
};
registerDocumentTools(registrar, "blog", "article", articleMetaSchema);
registerDocumentTools(
  registrar,
  "changelog",
  "product_update",
  productUpdateMetaSchema,
);
const mcpContext = (teamId: string) => ({
  http: {
    authInfo: {
      token: "test-key",
      clientId: "test-client",
      scopes: [],
      extra: { authKind: "api_key", teamId, account: null },
    },
  },
});
async function callTool(name: string, teamId: string, input: Record<string, unknown>) {
  const tool = tools.get(name)!;
  return tool.handler(
    z.object(tool.config.inputSchema).parse(input),
    mcpContext(teamId),
  );
}

const markdown =
  "# Launch\n\nWe shipped **dark mode**.\n\n```ts\nconst on = true;\n```\n";
const converted = parseDocsMarkdown(markdown, { frontmatter: false }).content;

describe("Markdown bodies for articles and product updates", () => {
  let teamId: string;
  let server: Server;
  let origin: string;
  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as any).teamId = req.headers["x-test-team"];
      next();
    });
    app.use(blogsRouter);
    app.use(changelogsRouter);
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    if (server?.listening)
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
  });
  beforeEach(async () => {
    teamId = (await seedTeam(db)).team.id;
  });
  const send = (method: string, path: string, body: unknown) =>
    fetch(`${origin}${path}`, {
      method,
      headers: { "Content-Type": "application/json", "x-test-team": teamId },
      body: JSON.stringify(body),
    });

  it("stores converted Markdown on create and update", async () => {
    expect(converted.content?.map((node) => node.type)).toEqual([
      "heading",
      "paragraph",
      "codeBlock",
    ]);
    const created = await createDocument("blog", { teamId, title: "Launch", markdown });
    expect(created.draftContent).toEqual(converted);
    const withContent = await createDocument("changelog", {
      teamId,
      title: "Content",
      content: converted as never,
    });
    expect(withContent.draftContent).toEqual(converted);
    const updated = await updateDocument("changelog", teamId, withContent.documentId, {
      markdown: "Just text.",
    });
    expect(updated!.draftContent).toEqual({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Just text." }] }],
    });
  });

  it("rejects content and markdown together", async () => {
    await expect(
      createDocument("blog", {
        teamId,
        title: "Both",
        markdown,
        content: converted as never,
      }),
    ).rejects.toMatchObject({
      name: "DocsContentError",
      diagnostics: [{ code: "INVALID_REQUEST", fieldPath: "markdown" }],
    });
  });

  it("returns structured diagnostics over REST instead of a server error", async () => {
    const created = await send("POST", "/content/articles", {
      title: "Post",
      markdown,
    });
    expect(created.status).toBe(201);
    const article: any = await created.json();
    expect(article.draftContent).toEqual(converted);

    const invalid = await send("PATCH", `/content/articles/${article.documentId}`, {
      markdown: "Intro\n\n<script>bad()</script>\n",
    });
    expect(invalid.status).toBe(422);
    expect(
      documentationValidationErrorSchema.parse(await invalid.json()),
    ).toMatchObject({
      code: "UNSUPPORTED_NODE",
      diagnostics: [{ code: "UNSUPPORTED_NODE", line: 3, column: 1 }],
    });

    const both = await send("POST", "/content/product-updates", {
      title: "Both",
      markdown,
      content: converted,
    });
    expect(both.status).toBe(400);
    expect(documentationValidationErrorSchema.parse(await both.json()).code).toBe(
      "INVALID_REQUEST",
    );
    expect(
      (await getDocumentByDocumentId("blog", article.documentId))?.draftContent,
    ).toEqual(converted);
  });

  it("accepts Markdown through the MCP tools with the same error body", async () => {
    const created = await callTool("create_product_update", teamId, {
      title: "Release",
      markdown,
    });
    expect(created.isError).toBeFalsy();
    expect(created.structuredContent.draftContent).toEqual(converted);

    const invalid = await callTool("update_article", teamId, {
      documentId: (await createDocument("blog", { teamId, title: "Draft" })).documentId,
      markdown: "- 1. Step\n",
    });
    expect(invalid.isError).toBe(true);
    expect(
      documentationValidationErrorSchema.parse(invalid.structuredContent),
    ).toMatchObject({
      code: "INVALID_DOCUMENT",
      diagnostics: [{ code: "INVALID_DOCUMENT", line: 1 }],
    });
    expect(tools.get("create_article")!.config.description).toContain("Markdown");
    expect(tools.get("update_product_update")!.config.description).toContain(
      "Markdown",
    );
  });

  it("refuses agent Markdown with a block missing a required prop", async () => {
    const result = await callTool("create_article", teamId, {
      title: "CTA",
      markdown: 'Intro.\n\n<Button label="Start" />\n',
    });
    expect(result.isError).toBe(true);
    expect(
      documentationValidationErrorSchema.parse(result.structuredContent),
    ).toMatchObject({
      code: "INCOMPLETE_BLOCK",
      diagnostics: [
        {
          code: "INCOMPLETE_BLOCK",
          message: "<Button> needs href before it can be published.",
          blocksSave: true,
        },
      ],
    });
  });

  it("describes every block, its props and examples in the markdown field", () => {
    const field = tools.get("create_article")!.config.inputSchema.markdown;
    const text: string = field.description;
    for (const needle of [
      "- Button:",
      "href: URL",
      "- Tab (inside <Tabs>)",
      "items?: string[]",
      "register_media",
      "https://frontlit.app/schema/content.v1.json",
    ])
      expect(text).toContain(needle);
  });
});
