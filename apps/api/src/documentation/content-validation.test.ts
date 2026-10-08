import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  documentationMetaSchema,
  documentationPublicationSchema,
  documentationPreviewSchema,
  documentationHistorySchema,
  documentationValidationErrorSchema,
} from "@frontlit/api-contract";
import { makeTestDb, seedTeam, type TestDb } from "../test/db";

vi.mock("../db/client", async () => ({ db: await makeTestDb() }));
// Transport/domain validation is exercised here; operation authorization has
// independent DM-AUTH coverage in operation-policy.coverage.test.ts.
vi.mock("../auth/middleware", () => ({
  requireAuth: (_req: any, _res: any, next: any) => next(),
}));
vi.mock("../auth/require-team", () => ({
  requireTeam: (_req: any, _res: any, next: any) => next(),
}));
vi.mock("../auth/authorize", () => ({
  authorizeHandlers: (handlers: unknown) => handlers,
}));

import { getDocsSettings } from "./authoring";
import { processPublication } from "./publications";
import { db as testDb } from "../db/client";
import router from "../documents/docs-routes";
import sectionRouter from "./routes";
import { registerDocumentationTools } from "../mcp/tools/documentation";
import {
  createDocument,
  getDocumentByDocumentId,
  updateDocument,
  publishDocument,
} from "../documents/queries";
import { registerDocumentTools } from "../mcp/tools/documents";
import { createTicket } from "../tickets/queries";
import { recordDocumentationEvidence } from "./improvements";
import { DocsContentError } from "@frontlit/text-editor/docs";

const db = testDb as unknown as TestDb;
const tools = new Map<string, { config: any; handler: any }>();
registerDocumentTools(
  {
    registerTool: (name, config, handler) => {
      tools.set(name, { config, handler });
    },
  },
  "doc",
  "documentation_page",
  documentationMetaSchema,
);
registerDocumentationTools({
  registerTool: (name, config, handler) => {
    tools.set(name, { config, handler });
  },
});
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

describe("DM-VALIDATE docs authoring transport parity", () => {
  let teamId: string;
  let documentId: string;
  let ownerId: string;
  let server: Server;
  let origin: string;
  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as any).teamId = req.headers["x-test-team"];
      (req as any).authz = req.headers["x-test-support"]
        ? { isOwner: true, accountId: req.headers["x-test-account"] }
        : { permissions: ["documentation:read", "documentation:write"] };
      next();
    });
    app.use(sectionRouter);
    app.use(router);
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
    const seeded = await seedTeam(db);
    teamId = seeded.team.id;
    ownerId = seeded.account.id;
    documentId = (await createDocument("doc", { teamId, title: "Example" })).documentId;
  });
  const patch = (body: unknown) =>
    fetch(`${origin}/content/documentation/${documentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-test-team": teamId },
      body: JSON.stringify({ expectedDraftVersion: 1, ...(body as any) }),
    });
  async function mcpUpdate(body: Record<string, unknown>) {
    const tool = tools.get("update_documentation_page")!;
    const args = z.object(tool.config.inputSchema).parse({
      documentId,
      expectedDraftVersion: (await getDocumentByDocumentId("doc", documentId))!
        .draftVersion,
      ...body,
    });
    return tool.handler(args, mcpContext(teamId));
  }

  it("serializes concurrent REST and MCP saves of the same version without mixing fields (V04)", async () => {
    const [rest, mcp] = await Promise.all([
      patch({ title: "REST winner", slug: "rest-winner" }),
      tools.get("update_documentation_page")!.handler(
        {
          documentId,
          expectedDraftVersion: 1,
          title: "MCP winner",
          slug: "mcp-winner",
        },
        mcpContext(teamId),
      ),
    ]);
    const restBody = await rest.json();
    const restWon = rest.status === 200;
    expect(rest.status).toBe(restWon ? 200 : 409);
    expect(Boolean(mcp.isError)).toBe(restWon);
    const rejected = restWon ? mcp.structuredContent : restBody;
    expect(documentationValidationErrorSchema.parse(rejected)).toMatchObject({
      code: "STALE_DOCS_DRAFT",
      currentDraftVersion: 2,
    });
    const stored = await getDocumentByDocumentId("doc", documentId);
    expect(stored).toMatchObject({
      draftVersion: 2,
      draftTitle: restWon ? "REST winner" : "MCP winner",
      draftSlug: restWon ? "rest-winner" : "mcp-winner",
    });
  });
  it("returns the same stale-version report through REST and MCP", async () => {
    await patch({ title: "Winner" });
    const rest = await patch({ title: "Stale" });
    expect(rest.status).toBe(409);
    const body = documentationValidationErrorSchema.parse(await rest.json());
    expect(body.currentDraftVersion).toBe(2);
    const mcp = await tools
      .get("update_documentation_page")!
      .handler(
        { documentId, title: "Stale", expectedDraftVersion: 1 },
        mcpContext(teamId),
      );
    expect(mcp).toMatchObject({ isError: true, structuredContent: body });
    expect((await getDocumentByDocumentId("doc", documentId))?.draftTitle).toBe(
      "Winner",
    );
  });
  it("requires versions and emits structured request diagnostics", async () => {
    const response = await fetch(`${origin}/content/documentation/${documentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-test-team": teamId },
      body: JSON.stringify({ title: "Missing version" }),
    });
    expect(response.status).toBe(400);
    expect(documentationValidationErrorSchema.parse(await response.json()).code).toBe(
      "INVALID_REQUEST",
    );
  });
  it("shares read-only validation reports between literal REST and MCP routes", async () => {
    const input = {
      mode: "document",
      documentId,
      draft: { title: "", markdown: "[Missing](/docs/missing)" },
    };
    const before = await getDocumentByDocumentId("doc", documentId);
    const response = await fetch(`${origin}/content/documentation/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-test-team": teamId },
      body: JSON.stringify(input),
    });
    expect(response.status).toBe(200);
    const body: any = await response.json();
    expect(body.publishable).toBe(false);
    expect(body.saved).toBe(false);
    const result = await tools
      .get("validate_documentation")!
      .handler({ input }, mcpContext(teamId));
    expect(result.structuredContent).toEqual(body);
    expect((await getDocumentByDocumentId("doc", documentId))?.draftVersion).toBe(
      before?.draftVersion,
    );
  });
  it.each([
    { type: "doc", content: [{ type: "paragraph", content: [{ type: "mystery" }] }] },
    {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "X", marks: [{ type: "underline" }] }],
        },
      ],
    },
    { type: "doc", secretAttribute: true, content: [] },
    {
      type: "doc",
      content: [{ type: "image", attrs: { src: "data:image/png;base64,YQ==" } }],
    },
  ])(
    "V02/V26: REST and MCP reject equivalent unsafe trees before writing",
    async (content) => {
      const before = await getDocumentByDocumentId("doc", documentId);
      const response = await patch({ title: "Must not be saved", content });
      expect(response.status).toBe(422);
      const rest = documentationValidationErrorSchema.parse(await response.json());
      const mcp = await mcpUpdate({ title: "Must not be saved", content });
      expect(mcp.isError).toBe(true);
      expect(mcp.structuredContent).toEqual(rest);
      expect(rest.diagnostics[0].fieldPath).toMatch(/^content/);
      expect(
        tools
          .get("update_documentation_page")!
          .config.outputSchema.safeParse(mcp.structuredContent).success,
      ).toBe(true);
      const after = await getDocumentByDocumentId("doc", documentId);
      expect(after?.draftTitle).toBe(before?.draftTitle);
      expect(after?.draftContent).toEqual(before?.draftContent);
      expect(after?.updatedAt).toEqual(before?.updatedAt);
    },
  );

  it("DM-VALIDATE: a serialization failure leaves all draft fields intact", async () => {
    const before = await getDocumentByDocumentId("doc", documentId);
    // Markdown cannot express an image mixed into a paragraph in the block-image profile.
    await expect(
      updateDocument("doc", teamId, documentId, {
        expectedDraftVersion: 1,
        title: "Must not save",
        content: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [
                { type: "image", attrs: { src: "https://example.com/image.png" } },
              ],
            },
          ],
        },
      }),
    ).rejects.toBeInstanceOf(DocsContentError);
    expect((await getDocumentByDocumentId("doc", documentId))?.draftTitle).toBe(
      before?.draftTitle,
    );
  });

  it("DM-VALIDATE: saves a supported tree through either transport", async () => {
    const content = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Supported prose" }] },
      ],
    };
    expect((await patch({ content })).status).toBe(200);
    const result = await mcpUpdate({ content, title: "Edited" });
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent.draftTitle).toBe("Edited");
    expect(result.structuredContent.draftContent).toEqual(content);
  });

  it("DM-VALIDATE: rejects unknown request fields instead of silently ignoring typos", async () => {
    expect((await patch({ titel: "Typo" })).status).toBe(400);
    const result = await tools
      .get("update_documentation_page")!
      .handler({ documentId, titel: "Typo" }, mcpContext(teamId));
    expect(result).toMatchObject({
      isError: true,
      structuredContent: { code: "INVALID_REQUEST" },
    });
    expect((await getDocumentByDocumentId("doc", documentId))?.draftTitle).toBe(
      "Example",
    );
  });

  it("V25: another team's document cannot disclose content diagnostics", async () => {
    const foreignTeam = (await seedTeam(db)).team.id;
    const response = await fetch(`${origin}/content/documentation/${documentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-test-team": foreignTeam },
      body: JSON.stringify({
        expectedDraftVersion: 1,
        content: { type: "doc", content: [{ type: "unknown" }] },
      }),
    });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Not found" });
    const tool = tools.get("update_documentation_page")!;
    expect(
      await tool.handler(
        {
          documentId,
          expectedDraftVersion: 1,
          content: { type: "doc", content: [{ type: "unknown" }] },
        },
        mcpContext(foreignTeam),
      ),
    ).toMatchObject({ isError: true, content: [{ text: "Not found." }] });
  });

  it("DM-AUTH/DM-EDITOR: direct deletion cannot remove a published document", async () => {
    await publishDocument("doc", teamId, documentId, 1);
    const response = await fetch(
      `${origin}/content/documentation/${documentId}?expectedDraftVersion=1`,
      {
        method: "DELETE",
        headers: { "x-test-team": teamId },
      },
    );
    expect(response.status).toBe(409);
    const body = documentationValidationErrorSchema.parse(await response.json());
    expect(body.code).toBe("DOCUMENT_STILL_PUBLISHED");
    const tool = tools.get("delete_documentation_page")!;
    const result = await tool.handler(
      { documentId, expectedDraftVersion: 1 },
      mcpContext(teamId),
    );
    expect(result).toMatchObject({ isError: true, structuredContent: body });
    expect(tool.config.outputSchema.safeParse(result.structuredContent).success).toBe(
      true,
    );
    expect(
      (await getDocumentByDocumentId("doc", documentId))?.publishedAt,
    ).not.toBeNull();
  });

  it("DM-EDITOR/V05 indexing portion: saving indexable changes only draft metadata", async () => {
    const published = await publishDocument("doc", teamId, documentId, 1);
    const updated = await updateDocument("doc", teamId, documentId, {
      expectedDraftVersion: 1,
      meta: { indexable: false },
    });
    expect(updated?.draftMeta).toMatchObject({ indexable: false });
    expect(updated?.meta).toEqual(published?.meta);
  });
  it("D3 admission/status is equivalent over REST and MCP, including idempotent replay", async () => {
    const settings = await getDocsSettings(teamId);
    const input = {
      selected: [{ documentId, expectedDraftVersion: 1 }],
      removals: [],
      expectedPublicationId: null,
      expectedDocsDraftVersion: settings.draftVersion,
      idempotencyKey: "transport-publication",
    };
    const response = await fetch(`${origin}/content/documentation/publications`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-test-team": teamId },
      body: JSON.stringify(input),
    });
    expect(response.status).toBe(202);
    const rest = documentationPublicationSchema.parse(await response.json());
    const tool = tools.get("publish_documentation_changes")!;
    const mcp = await tool.handler(input, mcpContext(teamId));
    expect(mcp.structuredContent).toEqual(rest);
    expect(tool.config.outputSchema.safeParse(mcp.structuredContent).success).toBe(
      true,
    );
    await processPublication(teamId, rest.publicationId);
    const status = await fetch(
      `${origin}/content/documentation/publications/${rest.publicationId}`,
      { headers: { "x-test-team": teamId } },
    );
    expect(documentationPublicationSchema.parse(await status.json()).status).toBe(
      "active",
    );
    const otherTeam = (await seedTeam(db)).team.id;
    const foreign = await fetch(
      `${origin}/content/documentation/publications/${rest.publicationId}`,
      { headers: { "x-test-team": otherTeam } },
    );
    expect(foreign.status).toBe(404);
    expect(
      (
        await tools
          .get("get_documentation_publication")!
          .handler({ publicationId: rest.publicationId }, mcpContext(otherTeam))
      ).isError,
    ).toBe(true);
  });
  it("D3 MCP purge cannot bypass interactive completion", async () => {
    const before = await getDocsSettings(teamId);
    const result = await tools.get("purge_documentation")!.handler(
      {
        planId: "purge_missing",
        planHash: "hash",
        acknowledgment: "irreversible-deletion",
        idempotencyKey: "no-bypass",
      },
      mcpContext(teamId),
    );
    expect(result).toMatchObject({
      isError: true,
      structuredContent: { code: "INTERACTIVE_OWNER_REQUIRED" },
    });
    expect(await getDocsSettings(teamId)).toEqual(before);
  });
  it("D4 preview is equivalent over REST/MCP and remains private and noindex", async () => {
    const response = await fetch(
      `${origin}/content/documentation/${documentId}/preview`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-test-team": teamId },
        body: JSON.stringify({ expectedDraftVersion: 1 }),
      },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-robots-tag")).toBe("noindex");
    const rest = documentationPreviewSchema.parse(await response.json());
    const mcp = await tools
      .get("preview_documentation_page")!
      .handler({ documentId, expectedDraftVersion: 1 }, mcpContext(teamId));
    expect(documentationPreviewSchema.parse(mcp.structuredContent)).toEqual(rest);
    const stale = await fetch(`${origin}/content/documentation/${documentId}/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-test-team": teamId },
      body: JSON.stringify({ expectedDraftVersion: 2 }),
    });
    expect(stale.status).toBe(409);
  });
  it("D4 ordinary history is team-scoped and has REST/MCP parity", async () => {
    await publishDocument("doc", teamId, documentId, 1);
    const response = await fetch(
      `${origin}/content/documentation/publications?limit=20`,
      { headers: { "x-test-team": teamId } },
    );
    expect(response.status).toBe(200);
    const rest = documentationHistorySchema.parse(await response.json());
    expect(rest.items.length).toBeGreaterThan(0);
    const mcp = await tools
      .get("list_documentation_publications")!
      .handler({ limit: 20 }, mcpContext(teamId));
    expect(documentationHistorySchema.parse(mcp.structuredContent)).toEqual(rest);
    const foreign = await tools
      .get("preview_documentation_page")!
      .handler(
        { documentId, expectedDraftVersion: 1 },
        mcpContext((await seedTeam(db)).team.id),
      );
    expect(foreign.isError).toBe(true);
  });
  it("projects approved artifacts identically through REST and MCP without raw support evidence", async () => {
    const ticket = await createTicket({
      teamId,
      subject: "Gap",
      message: "SECRET-TRANSPORT-721",
      requesterEmail: null,
      source: "api",
      scheduleAi: false,
    });
    const ref = (await recordDocumentationEvidence({
      teamId,
      ticketDbId: ticket.ticket.id,
      messageDbId: ticket.firstMessage.id,
      trigger: "negative_feedback",
    }))!;
    const path = `${origin}/content/documentation/improvements/${ref.itemId}`;
    expect((await fetch(path, { headers: { "x-test-team": teamId } })).status).toBe(
      404,
    );
    const supportContext = {
      http: {
        authInfo: {
          token: "test-oauth",
          clientId: "test-client",
          scopes: ["documentation:read", "documentation:write", "helpdesk:read"],
          extra: {
            authKind: "oauth",
            teamId,
            isOwner: true,
            account: { id: ownerId, email: "owner@example.com" },
          },
        },
      },
    };
    const approved = await tools.get("review_documentation_improvement")!.handler(
      {
        itemId: ref.itemId,
        input: {
          action: "approve-summary",
          expectedVersion: 1,
          title: "Safe guide",
          description: "Standalone correction",
          correction: "## Guide\n\nUse account settings.",
          noCustomerDetails: true,
        },
      },
      supportContext,
    );
    expect(approved.isError).not.toBe(true);
    expect(approved.structuredContent.approved.actorAccountId).toBe(ownerId);
    const response = await fetch(path, { headers: { "x-test-team": teamId } });
    expect(response.status).toBe(200);
    const rest: any = await response.json();
    const mcp = await tools
      .get("get_documentation_improvement")!
      .handler({ itemId: ref.itemId }, mcpContext(teamId));
    expect(mcp.structuredContent).toEqual(rest);
    expect(JSON.stringify(rest)).not.toMatch(
      /SECRET-TRANSPORT|evidenceCount|ticketId|question/,
    );
    const rejected = await fetch(path, {
      method: "PATCH",
      headers: { "content-type": "application/json", "x-test-team": teamId },
      body: JSON.stringify({ action: "dismiss", expectedVersion: rest.version }),
    });
    expect(rejected.status).toBe(403);
    const body = {
      expectedVersion: rest.version,
      approvedSummaryVersion: rest.approved.version,
      idempotencyKey: "transport-draft",
    };
    const draftResponse = await fetch(`${path}/draft`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-test-team": teamId },
      body: JSON.stringify(body),
    });
    expect(draftResponse.status).toBe(201);
    const mcpDraft = await tools
      .get("create_documentation_improvement_draft")!
      .handler({ itemId: ref.itemId, input: body }, mcpContext(teamId));
    expect(mcpDraft.structuredContent).toEqual(await draftResponse.json());
    const stale = await tools
      .get("review_documentation_improvement")!
      .handler(
        { itemId: ref.itemId, input: { action: "dismiss", expectedVersion: 1 } },
        supportContext,
      );
    expect(stale).toMatchObject({
      isError: true,
      structuredContent: { code: "STALE_IMPROVEMENT" },
    });
  });
});
