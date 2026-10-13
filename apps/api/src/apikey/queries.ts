import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import type { DbExecutor } from "../db/transaction";
import { apiKeys } from "../db/schema";
import { generateApiKey, hashApiKey } from "./secret";

export type ApiKey = typeof apiKeys.$inferSelect;

export async function getApiKeyBySecret(secret: string) {
  const keyHash = hashApiKey(secret);
  const apiKey = await db.query.apiKeys.findFirst({
    where: eq(apiKeys.keyHash, keyHash),
  });
  return apiKey ?? null;
}

export async function getApiKeysByTeamId(teamId: string, executor: DbExecutor = db) {
  return executor.query.apiKeys.findMany({
    where: eq(apiKeys.teamId, teamId),
  });
}

export async function createApiKey(
  teamId: string,
  name?: string,
  executor: DbExecutor = db,
) {
  const { secret, keyHash, keyPrefix } = generateApiKey();
  const [apiKey] = await executor
    .insert(apiKeys)
    .values({ teamId, name, keyHash, keyPrefix })
    .returning();
  return { apiKey, secret };
}

export async function deleteApiKey(
  teamId: string,
  id: string,
  executor: DbExecutor = db,
) {
  const deleted = await executor
    .delete(apiKeys)
    .where(and(eq(apiKeys.teamId, teamId), eq(apiKeys.id, id)))
    .returning({ id: apiKeys.id });
  return deleted.length > 0;
}
