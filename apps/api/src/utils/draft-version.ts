import { sql, type AnyColumn } from "drizzle-orm";

/** A save based on an older draft: someone else (an agent, Git, another
 * tab) wrote the draft after the caller read it. Nothing was written. */
export class StaleDraftError extends Error {
  readonly code = "STALE_DRAFT";
  constructor(readonly draftVersion: number) {
    super("This draft was changed elsewhere since you loaded it.");
  }
}

/** The REST/MCP body for a `StaleDraftError`. */
export function staleDraftBody(error: StaleDraftError) {
  return { error: error.message, code: error.code, draftVersion: error.draftVersion };
}

/** `SET draft_version = draft_version + 1`, for every write that changes draft columns. */
export function nextDraftVersion(column: AnyColumn) {
  return sql<number>`${column} + 1`;
}

/** Refuses a write based on an older draft version. `undefined` skips the check. */
export function assertDraftVersion(current: number, expected: number | undefined) {
  if (expected !== undefined && current !== expected)
    throw new StaleDraftError(current);
}
