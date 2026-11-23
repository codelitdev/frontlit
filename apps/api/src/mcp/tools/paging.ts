import { z } from "zod";

/** Paging for the content list tools, on top of the queries' 1-based
 * `offset` (a page number) and `itemsPerPage`. */
export const listPagingInput = {
  page: z.number().int().min(1).optional().describe("1-based page number (default 1)."),
  itemsPerPage: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe("Items per page (default 20, max 50)."),
};

export function listPaging(args: { page?: number; itemsPerPage?: number }) {
  return { offset: args.page, itemsPerPage: args.itemsPerPage };
}
