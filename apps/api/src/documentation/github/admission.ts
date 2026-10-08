import { and, eq, gt, inArray } from "drizzle-orm";
import {
  documentationGitSetups as setups,
  documentationGitMigrations as migrations,
} from "../../db/schema";
import { GitHubDocsError } from "./app";
import { db } from "../../db/client";
import { lockSettings } from "../authoring";
import type { AuthzContext } from "../../auth/authorize";
import { documentationPrincipal, reserveDocumentationValidation } from "../admission";

export async function reserveGitValidation(teamId: string, actor: AuthzContext) {
  const principal = documentationPrincipal(actor);
  if (!principal) throw new GitHubDocsError("GITHUB_USER_AUTH_REQUIRED", 403);
  return db.transaction(async (tx) => {
    await lockSettings(tx, teamId);
    await reserveDocumentationValidation(tx, teamId, principal);
  });
}
/** Call under the shared team settings lock; cancellation is never quota-gated. */
export async function requireGitPlanCapacity(tx: any, teamId: string) {
  const now = new Date();
  const pending = await tx.query.documentationGitSetups.findMany({
    where: and(
      eq(setups.teamId, teamId),
      gt(setups.expiresAt, now),
      inArray(setups.status, ["pending", "verifying", "authorized"]),
    ),
    limit: 10,
  });
  const plans = await tx.query.documentationGitMigrations.findMany({
    where: and(
      eq(migrations.teamId, teamId),
      gt(migrations.expiresAt, now),
      inArray(migrations.status, ["planned", "verified"]),
    ),
    limit: 10,
  });
  if (pending.length + plans.length >= 10) {
    const retryAt = new Date(
      Math.min(...[...pending, ...plans].map((row) => row.expiresAt.getTime())),
    );
    throw new GitHubDocsError("GITHUB_SETUP_LIMIT", 429, retryAt);
  }
}
