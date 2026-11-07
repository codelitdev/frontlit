import { db } from "../db/client";
import { searchIndexRequests } from "../db/schema";

type Executor = Pick<typeof db, "insert">;

/** Asks the search index worker to bring a team's index in line with what's
 * published. Pass the transaction when called inside one, so the request
 * commits (or rolls back) with the change that caused it. */
export async function requestSearchIndex(teamId: string, executor: Executor = db) {
  // Dates come from the app, like the worker's comparisons: the columns
  // have no time zone, so the database's `now()` could disagree with them.
  const now = new Date();
  await executor
    .insert(searchIndexRequests)
    .values({ teamId, requestedAt: now, nextAttemptAt: now })
    .onConflictDoUpdate({
      target: searchIndexRequests.teamId,
      set: { requestedAt: now, nextAttemptAt: now, attempts: 0 },
    });
}
