import type { McpToolRegistrar } from "../tool-registry";
import { z } from "zod";
import { pageSchema, successMessageSchema } from "@frontlit/api-contract";
import {
  countPages,
  createPage,
  deletePage,
  discardPageDraft,
  getPageByPageId,
  listPages,
  publishPage,
  updatePage,
  type PageView,
} from "../../pages/queries";
import {
  AUTH_ERROR,
  INTERNAL_ERROR,
  NOT_FOUND,
  errorResult,
  jsonResult,
} from "./responses";
import { getTeamId } from "./auth";
import { listPaging, listPagingInput } from "./paging";
import { omitInternal, serializeDates } from "../../utils/public";
import { PAGE_TEXT_FORMAT } from "@frontlit/page-builder/schema";
import { InvalidPageLayoutError } from "../../pages/shared-widgets";
import { PageOwnedByGitError } from "../../pages/git-pr";

const pageSummarySchema = pageSchema.pick({
  pageId: true,
  name: true,
  slug: true,
  status: true,
  publishedAt: true,
  updatedAt: true,
  robotsAllowed: true,
});

/** List items carry no layouts: those make a list too large for MCP
 * clients, which truncate the result before the status fields. */
function toPageSummary(page: PageView) {
  return serializeDates({
    pageId: page.pageId,
    name: page.name,
    slug: page.slug,
    status: page.status,
    publishedAt: page.publishedAt,
    updatedAt: page.updatedAt,
    robotsAllowed: page.robotsAllowed,
  });
}

function toPublicPage<T extends Record<string, unknown>>(page: T) {
  return serializeDates(omitInternal(page, "teamId"));
}

export function registerPageTools(server: McpToolRegistrar): void {
  server.registerTool(
    "list_pages",
    {
      description:
        "Lists the team's pages, most recently edited first, as summaries: status (draft, published or published_with_changes), publishedAt and robotsAllowed, without layouts. Use get_page for a page's layout. Results are paged; total is the number of matching pages.",
      inputSchema: {
        q: z.string().optional().describe("Search term matched against page name"),
        ...listPagingInput,
      },
      outputSchema: z.object({
        items: z.array(pageSummarySchema),
        total: z.number(),
      }),
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    async (args: any, extra: any) => {
      const teamId = getTeamId(extra);
      if (!teamId) return AUTH_ERROR;
      try {
        const [items, total] = await Promise.all([
          listPages({ teamId, q: args.q, ...listPaging(args) }),
          countPages({ teamId, q: args.q }),
        ]);
        return jsonResult({ items: items.map(toPageSummary), total });
      } catch {
        return INTERNAL_ERROR;
      }
    },
  );

  server.registerTool(
    "create_page",
    {
      description:
        "Creates a new page with the team's required shared header and footer.",
      inputSchema: {
        name: z.string().min(1),
      },
      outputSchema: pageSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
      },
    },
    async (args: any, extra: any) => {
      const teamId = getTeamId(extra);
      if (!teamId) return AUTH_ERROR;
      try {
        const page = await createPage({
          teamId,
          name: args.name,
        });
        return jsonResult(toPublicPage(page));
      } catch {
        return INTERNAL_ERROR;
      }
    },
  );

  server.registerTool(
    "get_page",
    {
      description: "Fetches a single page by id, including its full block layout.",
      inputSchema: { pageId: z.string() },
      outputSchema: pageSchema,
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    async (args: any, extra: any) => {
      const teamId = getTeamId(extra);
      if (!teamId) return AUTH_ERROR;
      try {
        const page = await getPageByPageId(args.pageId);
        if (!page || page.teamId !== teamId) return NOT_FOUND;
        return jsonResult(toPublicPage(page));
      } catch {
        return INTERNAL_ERROR;
      }
    },
  );

  server.registerTool(
    "update_page",
    {
      description: `Updates a page's metadata (name, SEO) and/or its block layout. Writes only the page's draft state — call publish_page to make changes live. Block settings are validated against the block schemas (https://frontlit.app/schema/page.v1.json describes them; rich text there is Markdown, here TipTap JSON) and stored in canonical form, with settings equal to a block default omitted. Rich text holds only basic formatting; anything else is rejected. ${PAGE_TEXT_FORMAT}`,
      inputSchema: {
        pageId: z.string(),
        name: z.string().optional(),
        layout: z.array(z.record(z.any())).optional(),
        title: z.string().optional(),
        description: z.string().optional(),
        robotsAllowed: z.boolean().optional(),
      },
      outputSchema: pageSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
      },
    },
    async (args: any, extra: any) => {
      const teamId = getTeamId(extra);
      if (!teamId) return AUTH_ERROR;
      try {
        const { pageId, ...patch } = args;
        const page = await updatePage(teamId, pageId, patch);
        if (!page) return NOT_FOUND;
        return jsonResult(toPublicPage(page));
      } catch (error) {
        if (
          error instanceof InvalidPageLayoutError ||
          error instanceof PageOwnedByGitError
        ) {
          return errorResult(error.message);
        }
        return INTERNAL_ERROR;
      }
    },
  );

  server.registerTool(
    "delete_page",
    {
      description:
        "Permanently deletes a page. Standard (non-deletable) pages cannot be deleted.",
      inputSchema: { pageId: z.string() },
      outputSchema: successMessageSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
      },
    },
    async (args: any, extra: any) => {
      const teamId = getTeamId(extra);
      if (!teamId) return AUTH_ERROR;
      try {
        const result = await deletePage(teamId, args.pageId);
        if (!result.ok && result.reason === "not_found") return NOT_FOUND;
        if (!result.ok && result.reason === "not_deletable") {
          return errorResult("This is a standard page and can't be deleted.");
        }
        return jsonResult({ message: "Page deleted." });
      } catch (error) {
        if (error instanceof PageOwnedByGitError) return errorResult(error.message);
        return INTERNAL_ERROR;
      }
    },
  );

  server.registerTool(
    "publish_page",
    {
      description:
        "Publishes a page: copies its draft block layout and SEO fields into the published fields the public site renders.",
      inputSchema: { pageId: z.string() },
      outputSchema: pageSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async (args: any, extra: any) => {
      const teamId = getTeamId(extra);
      if (!teamId) return AUTH_ERROR;
      try {
        const page = await publishPage(teamId, args.pageId);
        if (!page) return NOT_FOUND;
        return jsonResult(toPublicPage(page));
      } catch (error) {
        if (error instanceof PageOwnedByGitError) return errorResult(error.message);
        return INTERNAL_ERROR;
      }
    },
  );

  server.registerTool(
    "discard_page_draft",
    {
      description:
        "Discards a page's draft changes, resetting the draft layout and SEO fields back to whatever is currently published.",
      inputSchema: { pageId: z.string() },
      outputSchema: pageSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
      },
    },
    async (args: any, extra: any) => {
      const teamId = getTeamId(extra);
      if (!teamId) return AUTH_ERROR;
      try {
        const page = await discardPageDraft(teamId, args.pageId);
        if (!page) return NOT_FOUND;
        return jsonResult(toPublicPage(page));
      } catch {
        return INTERNAL_ERROR;
      }
    },
  );
}
