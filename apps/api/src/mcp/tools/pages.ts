import { StaleDraftError, staleDraftBody } from "../../utils/draft-version";
import type { McpToolRegistrar } from "../tool-registry";
import { z } from "zod";
import { pageSchema, successMessageSchema } from "@frontlit/api-contract";
import {
  countPages,
  createPage,
  deletePage,
  discardPageDraft,
  draftPageFile,
  editPageDraft,
  getPageByPageId,
  InvalidStoredDraftError,
  listPages,
  sharedWidgetsHaveChanges,
  publishPage,
  replacePageDraftLayout,
  updatePage,
  type PageView,
} from "../../pages/queries";
import {
  AUTH_ERROR,
  INTERNAL_ERROR,
  NOT_FOUND,
  editableTextResult,
  errorResult,
  jsonResult,
} from "./responses";
import { textEditErrorResult, textEditsField } from "./documents";
import { TextEditError } from "@frontlit/text-editor/blocks";
import { getTeamId } from "./auth";
import { listPaging, listPagingInput } from "./paging";
import { omitInternal, serializeDates } from "../../utils/public";
import {
  PAGE_SCHEMA_URL,
  PAGE_TEXT_FORMAT,
  SchemaValidationError,
} from "@frontlit/page-builder/schema";
import { InvalidPageLayoutError } from "../../pages/shared-widgets";
import { PageOwnedByGitError } from "../../pages/git-pr";

const pageSummarySchema = pageSchema
  .pick({
    pageId: true,
    name: true,
    slug: true,
    status: true,
    publishedAt: true,
    updatedAt: true,
    robotsAllowed: true,
  })
  .extend({
    draftRobotsAllowed: z
      .boolean()
      .describe(
        "Whether search engines may index the page once its draft is published.",
      ),
  });

/** A stored draft that no longer matches the block schemas (saved before a
 * schema change) has no page file. Report why, with the stored draft, so an
 * agent can repair it with update_page. */
function invalidDraftResult(error: SchemaValidationError, page?: PageView) {
  return {
    ...jsonResult({
      error:
        "This page's draft no longer matches the page schema, so it has no page file to edit. Fix the listed blocks with update_page (layout), then use edit_page.",
      code: "INVALID_STORED_DRAFT",
      diagnostics: error.diagnostics,
      ...(page
        ? {
            draftLayout: page.draftLayout,
            draftTitle: page.draftTitle,
            draftDescription: page.draftDescription,
          }
        : {}),
    }),
    isError: true,
  };
}

/** get_page: the page with its draft as page file text instead of layouts. */
const pageFileViewSchema = pageSchema
  .omit({
    layout: true,
    draftLayout: true,
    draftTitle: true,
    draftDescription: true,
    draftSocialImage: true,
    draftRobotsAllowed: true,
  })
  .extend({
    draftFile: z
      .string()
      .describe(
        "The draft (layout and SEO) as its page file; edit_page changes exactly this text.",
      ),
  });

const pageEditResultSchema = z.object({
  pageId: z.string(),
  status: pageSchema.shape.status,
  draftVersion: z.number().int(),
  updatedAt: z.string().nullable(),
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
    // Unset means the default: indexable.
    draftRobotsAllowed: page.draftRobotsAllowed !== false,
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
        "Lists the team's pages, most recently edited first, as summaries: status (draft, published or published_with_changes, for the page's own content), publishedAt, robotsAllowed (live page; null when unpublished) and draftRobotsAllowed, without layouts. sharedWidgetsHaveChanges is true when the site's shared header/footer have unpublished edits; publishing any page takes them live. Use get_page for a page's layout. Results are paged; total is the number of matching pages.",
      inputSchema: {
        q: z.string().optional().describe("Search term matched against page name"),
        ...listPagingInput,
      },
      outputSchema: z.object({
        items: z.array(pageSummarySchema),
        total: z.number(),
        sharedWidgetsHaveChanges: z
          .boolean()
          .describe("The shared header/footer have unpublished edits."),
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
        const [items, total, sharedChanges] = await Promise.all([
          listPages({ teamId, q: args.q, ...listPaging(args) }),
          countPages({ teamId, q: args.q }),
          sharedWidgetsHaveChanges(teamId),
        ]);
        return jsonResult({
          items: items.map(toPageSummary),
          total,
          sharedWidgetsHaveChanges: sharedChanges,
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
      description: `Fetches a single page by id: name, slug, status, draftVersion and the published SEO fields, plus draftFile, the draft as its page file (${PAGE_SCHEMA_URL}: layout and SEO, rich text as Markdown, defaults omitted), also returned verbatim as its own text block. Copy old_str values for edit_page from it; inside JSON strings, line breaks are \\n and quotes are \\". To change part of the page, use edit_page; update_page replaces whole fields. The shared header/footer are not part of the page file.`,
      inputSchema: { pageId: z.string() },
      outputSchema: pageFileViewSchema,
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
        const {
          layout: _layout,
          draftLayout: _draftLayout,
          draftTitle: _title,
          draftDescription: _description,
          draftSocialImage: _socialImage,
          draftRobotsAllowed: _robots,
          ...rest
        } = toPublicPage(page) as Record<string, unknown>;
        let file: string;
        try {
          file = draftPageFile(page);
        } catch (error) {
          if (error instanceof SchemaValidationError)
            return invalidDraftResult(error, page);
          throw error;
        }
        return editableTextResult(rest, "draftFile", file);
      } catch {
        return INTERNAL_ERROR;
      }
    },
  );

  server.registerTool(
    "edit_page",
    {
      description: `Changes part of a page's draft (layout and SEO) with exact-match replacements on the draftFile get_page returns, without resending the layout. Each old_str must match exactly once (JSON escaping included); all edits apply or none do. Blocks can be changed, added, removed or reordered. A failed match returns EDIT_NOT_FOUND or EDIT_AMBIGUOUS with the edit's index (re-read with get_page); an invalid page returns the schema errors. Edits made at the same moment as another save are re-applied to the newer draft. Writes only the draft; call publish_page to make it live. Replies without the page. ${PAGE_TEXT_FORMAT}`,
      inputSchema: { pageId: z.string(), edits: textEditsField },
      outputSchema: pageEditResultSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
      },
    },
    async (args: any, extra: any) => {
      const teamId = getTeamId(extra);
      if (!teamId) return AUTH_ERROR;
      try {
        const page = await editPageDraft(teamId, args.pageId, args.edits);
        if (!page) return NOT_FOUND;
        const view = toPublicPage(page) as Record<string, unknown>;
        return jsonResult({
          pageId: view.pageId,
          status: view.status,
          draftVersion: view.draftVersion,
          updatedAt: view.updatedAt,
        });
      } catch (error) {
        if (error instanceof TextEditError) return textEditErrorResult(error);
        if (error instanceof InvalidStoredDraftError)
          return invalidDraftResult(error.cause);
        if (error instanceof SchemaValidationError)
          return {
            ...jsonResult({ error: error.message, diagnostics: error.diagnostics }),
            isError: true,
          };
        if (error instanceof StaleDraftError)
          return { ...jsonResult(staleDraftBody(error)), isError: true };
        if (error instanceof InvalidPageLayoutError) return errorResult(error.message);
        return INTERNAL_ERROR;
      }
    },
  );

  server.registerTool(
    "update_page",
    {
      description: `Updates a page's name, SEO fields and/or its whole block layout. Writes only the page's draft state — call publish_page to make changes live. \`layout\` is the layout array of the page file (the same form as draftFile from get_page: https://frontlit.app/schema/page.v1.json, rich text as Markdown, no header or footer) and replaces the whole draft layout; it also repairs a draft get_page reports as INVALID_STORED_DRAFT. To change part of the page (blocks, text or SEO), use edit_page instead. ${PAGE_TEXT_FORMAT}`,
      inputSchema: {
        pageId: z.string(),
        name: z.string().optional(),
        layout: z
          .array(z.record(z.any()))
          .optional()
          .describe(
            'The page file\'s layout: blocks as { "name", "settings" }, as in draftFile.',
          ),
        title: z.string().optional(),
        description: z.string().optional(),
        robotsAllowed: z.boolean().optional(),
        expectedDraftVersion: z
          .number()
          .int()
          .positive()
          .optional()
          .describe(
            "The draftVersion you read. If the draft changed since, nothing is saved and STALE_DRAFT is returned. Omit to overwrite unconditionally.",
          ),
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
        const { pageId, layout, name, ...patch } = args;
        let page: Awaited<ReturnType<typeof updatePage>> | undefined;
        if (layout === undefined) {
          page = await updatePage(teamId, pageId, { name, ...patch });
        } else {
          // The page file holds layout and SEO; the name is not part of it.
          const { title, description, robotsAllowed, expectedDraftVersion } = patch;
          page = await replacePageDraftLayout(
            teamId,
            pageId,
            { layout, title, description, robotsAllowed },
            expectedDraftVersion,
          );
          if (page && name !== undefined)
            page = await updatePage(teamId, pageId, { name });
        }
        if (!page) return NOT_FOUND;
        return jsonResult(toPublicPage(page));
      } catch (error) {
        if (error instanceof SchemaValidationError)
          return {
            ...jsonResult({ error: error.message, diagnostics: error.diagnostics }),
            isError: true,
          };
        if (
          error instanceof InvalidPageLayoutError ||
          error instanceof PageOwnedByGitError
        ) {
          return errorResult(error.message);
        }
        if (error instanceof StaleDraftError)
          return { ...jsonResult(staleDraftBody(error)), isError: true };
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
