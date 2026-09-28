import { db } from "./client";

export type DbExecutor = typeof db;

function executorName(executor: DbExecutor): string {
  const session = (
    executor as {
      session?: {
        client?: { constructor?: { name?: string } };
        constructor?: { name?: string };
      };
    }
  ).session;
  return `${session?.client?.constructor?.name ?? ""} ${session?.constructor?.name ?? ""}`;
}

/** PGlite is used by the unit suite and does not support the row-locking
 * transaction path used in production. Production's node-postgres executor
 * always takes the real transaction branch. */
export function supportsSqlTransactions(executor: DbExecutor = db): boolean {
  return (
    typeof (executor as { transaction?: unknown }).transaction === "function" &&
    !/pglite/i.test(executorName(executor))
  );
}

export function supportsRowLocks(executor: DbExecutor = db): boolean {
  const name = executorName(executor);
  return name.length > 1 && !/pglite/i.test(name);
}

export async function withDbTransaction<T>(
  fn: (tx: DbExecutor) => Promise<T>,
): Promise<T> {
  if (!supportsSqlTransactions(db)) return fn(db);
  return db.transaction(async (tx) => fn(tx as unknown as DbExecutor));
}
