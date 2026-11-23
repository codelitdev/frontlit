import { z } from "zod";

/** Paging and filters shared by the content list tools. Lists return
 * summaries by default: bodies make a single page of results larger than
 * MCP clients accept, so they are opt-in (`include: "body"`). */
export const SUMMARY_LIMIT = 50;
export const BODY_LIMIT = 5;
export const MAX_LIMIT = 100;

export const contentStatusSchema = z.enum([
  "draft",
  "published",
  "published_with_changes",
]);

export function listInputSchema(searchDescription: string) {
  return {
    q: z.string().optional().describe(searchDescription),
    status: contentStatusSchema
      .optional()
      .describe(
        "Only items in this state: draft (never published), published (live, no pending changes), published_with_changes (live, with unpublished edits).",
      ),
    include: z
      .enum(["body"])
      .optional()
      .describe(
        `Also return each item's full draft and published body. Large: pair it with a small limit (default ${BODY_LIMIT} when set), or use the get_* tool for one item.`,
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(MAX_LIMIT)
      .optional()
      .describe(
        `Items per call (default ${SUMMARY_LIMIT}, or ${BODY_LIMIT} with include: "body").`,
      ),
    cursor: z.string().optional().describe("nextCursor from the previous call."),
  };
}

export const listPageInfoShape = {
  total: z
    .number()
    .describe("Items matching q and status, across all pages of results."),
  nextCursor: z
    .string()
    .nullable()
    .describe("Pass as cursor for more; null at the end."),
};

export interface ListArgs {
  status?: z.infer<typeof contentStatusSchema>;
  include?: "body";
  limit?: number;
  cursor?: string;
}

/** Filters `items` by status and cuts the page `cursor` points at. */
export function pageOfItems<T extends { status: string }>(items: T[], args: ListArgs) {
  const matching = args.status
    ? items.filter((item) => item.status === args.status)
    : items;
  const offset = Math.max(0, Number.parseInt(args.cursor ?? "0", 10) || 0);
  const limit = args.limit ?? (args.include === "body" ? BODY_LIMIT : SUMMARY_LIMIT);
  const end = offset + limit;
  return {
    slice: matching.slice(offset, end),
    total: matching.length,
    nextCursor: end < matching.length ? String(end) : null,
  };
}
