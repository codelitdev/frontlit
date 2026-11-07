import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { integrations, type IntegrationProvider } from "../db/schema";
import { decryptSecret, encryptSecret } from "../utils/crypto";

export async function getIntegration(teamId: string, provider: IntegrationProvider) {
  return db.query.integrations.findFirst({
    where: and(eq(integrations.teamId, teamId), eq(integrations.provider, provider)),
  });
}

/** Returns the team's decrypted SendLit API key, or null if the team hasn't
 * been provisioned on SendLit yet (architecture.md §10.1). */
export async function getSendlitApiKey(teamId: string): Promise<string | null> {
  const row = await getIntegration(teamId, "sendlit");
  if (!row) return null;
  const config = row.config as { apiKey: string };
  return decryptSecret(config.apiKey);
}

export async function storeSendlitApiKey(teamId: string, apiKey: string) {
  const encrypted = encryptSecret(apiKey);
  const existing = await getIntegration(teamId, "sendlit");

  if (existing) {
    const [updated] = await db
      .update(integrations)
      .set({ config: { apiKey: encrypted }, updatedAt: new Date() })
      .where(eq(integrations.id, existing.id))
      .returning();
    return updated;
  }

  const [created] = await db
    .insert(integrations)
    .values({ teamId, provider: "sendlit", config: { apiKey: encrypted } })
    .returning();
  return created;
}
