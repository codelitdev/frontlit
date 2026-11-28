import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { articleMetaSchema, staleDraftErrorSchema } from "@frontlit/api-contract";
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
import {
  createDocument,
  discardDocumentDraft,
  publishDocument,
  updateDocument,
} from "./queries";
import { registerDocumentTools } from "../mcp/tools/documents";
import { StaleDraftError } from "../utils/draft-version";

const db = testDb as unknown as TestDb;
const tools = new Map<string, { config: any; handler: any }>();
registerDocumentTools(
  {
    registerTool: (name: string, config: any, handler: any) =>
      tools.set(name, { config, handler }),
  },
  "blog",
  "article",
  articleMetaSchema,
);
async function callTool(name: string, teamId: string, input: Record<string, unknown>) {
  const tool = tools.get(name)!;
  return tool.handler(z.object(tool.config.inputSchema).parse(input), {
    http: {
      authInfo: {
        token: "test-key",
        clientId: "test-client",
        scopes: [],
        extra: { authKind: "api_key", teamId, account: null },
      },
    },
  });
}
const text = (value: string) => ({
  type: "doc" as const,
  content: [{ type: "paragraph", content: [{ type: "text", text: value }] }],
});

describe("article and product update draft versions", () => {
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
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  beforeEach(async () => {
    teamId = (await seedTeam(db)).team.id;
  });
  const patch = (documentId: string, body: unknown) =>
    fetch(`${origin}/content/articles/${documentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-test-team": teamId },
      body: JSON.stringify(body),
    });

  it("increments on every draft write, but not on slug changes or publish", async () => {
    const created = await createDocument("blog", { teamId, title: "Post" });
    expect(created.draftVersion).toBe(1);
    const titled = await updateDocument("blog", teamId, created.documentId, {
      title: "Renamed",
      expectedDraftVersion: 1,
    });
    expect(titled!.draftVersion).toBe(2);
    const moved = await updateDocument("blog", teamId, created.documentId, {
      slug: "moved",
    });
    expect(moved!.draftVersion).toBe(2);
    const published = await publishDocument("blog", teamId, created.documentId);
    expect(published!.draftVersion).toBe(2);
    await updateDocument("blog", teamId, created.documentId, { content: text("v2") });
    const discarded = await discardDocumentDraft("blog", teamId, created.documentId);
    expect(discarded!.draftVersion).toBe(4);
  });

  it("refuses a save based on an older version and writes nothing", async () => {
    const created = await createDocument("changelog", { teamId, title: "Entry" });
    await updateDocument("changelog", teamId, created.documentId, {
      content: text("agent edit"),
    });
    const stale = updateDocument("changelog", teamId, created.documentId, {
      content: text("editor autosave"),
      expectedDraftVersion: 1,
    });
    await expect(stale).rejects.toBeInstanceOf(StaleDraftError);
    await expect(stale).rejects.toMatchObject({ draftVersion: 2 });
    const current = await updateDocument("changelog", teamId, created.documentId, {
      title: "Entry",
      expectedDraftVersion: 2,
    });
    expect(current!.draftContent).toEqual(text("agent edit"));
  });

  it("lets only one of two concurrent saves from the same version win", async () => {
    const created = await createDocument("blog", { teamId, title: "Race" });
    const results = await Promise.allSettled(
      ["a", "b"].map((value) =>
        updateDocument("blog", teamId, created.documentId, {
          content: text(value),
          expectedDraftVersion: 1,
        }),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find(
      (r) => r.status === "rejected",
    ) as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(StaleDraftError);
  });

  it("requires expectedDraftVersion over REST and answers a stale save with 409 STALE_DRAFT", async () => {
    const created = await createDocument("blog", { teamId, title: "Post" });
    const missing = await patch(created.documentId, { title: "No version" });
    expect(missing.status).toBe(400);

    const saved = await patch(created.documentId, {
      title: "First",
      expectedDraftVersion: 1,
    });
    expect(saved.status).toBe(200);
    expect(((await saved.json()) as { draftVersion: number }).draftVersion).toBe(2);

    const stale = await patch(created.documentId, {
      title: "Stale",
      expectedDraftVersion: 1,
    });
    expect(stale.status).toBe(409);
    expect(staleDraftErrorSchema.parse(await stale.json())).toMatchObject({
      code: "STALE_DRAFT",
      draftVersion: 2,
    });
  });

  it("takes an optional expectedDraftVersion in update_article and returns draftVersion", async () => {
    const created = await createDocument("blog", { teamId, title: "Post" });
    const unchecked = await callTool("update_article", teamId, {
      documentId: created.documentId,
      title: "Agent",
    });
    expect(unchecked.isError).toBeUndefined();
    expect(unchecked.structuredContent.draftVersion).toBe(2);

    const stale = await callTool("update_article", teamId, {
      documentId: created.documentId,
      title: "Stale agent",
      expectedDraftVersion: 1,
    });
    expect(stale.isError).toBe(true);
    expect(stale.structuredContent).toMatchObject({
      code: "STALE_DRAFT",
      draftVersion: 2,
    });
  });
});
