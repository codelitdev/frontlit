import type { McpToolRegistrar } from "../tool-registry";
import { z } from "zod";
import {
  pageSchema,
  pageStatusSchema,
  successMessageSchema,
} from "@frontlit/api-contract";
import {
  createPage,
  deletePage,
  discardPageDraft,
  getPageByPageId,
  listAllPages,
  publishPage,
  updatePage,
  type PageView,
} from "../../pages/queries";
import { listInputSchema, listPageInfoShape, pageOfItems } from "./list-options";
import {
  AUTH_ERROR,
  INTERNAL_ERROR,
  NOT_FOUND,
  errorResult,
  jsonResult,
} from "./responses";
import { getTeamId } from "./auth";
import { omitInternal, serializeDates } from "../../utils/public";
import { PAGE_TEXT_FORMAT } from "@frontlit/page-builder/schema";
import { InvalidPageLayoutError } from "../../pages/shared-widgets";
import { PageOwnedByGitError } from "../../pages/git-pr";

const pageSummarySchema = z.object({
  pageId: z.string(),
  name: z.string(),
  slug: z.string(),
  status: pageStatusSchema,
  publishedAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
  hasUnpublishedChanges: z
    .boolean()
    .describe("The draft differs from what's live (always true for a draft)."),
  robotsAllowed: z
    .boolean()
    .nullable()
    .describe("Live page lets search engines index it; null when unpublished."),
  draftRobotsAllowed: z
    .boolean()
    .describe("The draft lets search engines index it once published."),
  deletable: z.boolean(),
});

function toPageSummary(page: PageView) {
  return serializeDates({
    pageId: page.pageId,
    name: page.name,
    slug: page.slug,
    status: page.status,
    publishedAt: page.publishedAt,
    updatedAt: page.updatedAt,
    hasUnpublishedChanges: page.status !== "published",
    robotsAllowed: page.robotsAllowed,
    draftRobotsAllowed: page.draftRobotsAllowed !== false,
    deletable: page.deletable,
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
        "Lists the team's pages as summaries (status, publishedAt, hasUnpublishedChanges, robots flags), newest edit first. Filter by name (q) or status; page with limit/cursor. Bodies are opt-in via include: \"body\"; get_page returns one page's full layout. A pending shared header/footer edit is reported once in sharedHeaderFooterHasUnpublishedChanges, not as changes on each page.",
      inputSchema: listInputSchema("Search term matched against page name"),
      outputSchema: z.object({
        items: z.array(pageSchema.partial().merge(pageSummarySchema)),
        ...listPageInfoShape,
        sharedHeaderFooterHasUnpublishedChanges: z
          .boolean()
          .describe(
            "The shared header/footer draft differs from the live site. Publishing any page publishes it too.",
          ),
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
        const { items, sharedHeaderFooterHasUnpublishedChanges } = await listAllPages({
          teamId,
          q: args.q,
        });
        const { slice, total, nextCursor } = pageOfItems(items, args);
        return jsonResult({
          items: slice.map((page) => {
            const summary = toPageSummary(page);
            // Summary first so status fields lead the serialized item.
            return args.include === "body"
              ? { ...summary, ...toPublicPage(page), ...summary }
              : summary;
          }),
          total,
          nextCursor,
          sharedHeaderFooterHasUnpublishedChanges,
        });
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
