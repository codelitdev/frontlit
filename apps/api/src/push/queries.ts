import { and, eq, inArray } from "drizzle-orm";
import { computeEffectivePermissions } from "@frontlit/api-contract";
import { db } from "../db/client";
import { pushSubscriptions, teamMembers, teams } from "../db/schema";

export async function savePushSubscription(input: {
  accountId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string | null;
}) {
  // One row per browser. A browser that was signed in as someone else now
  // belongs to this account.
  await db
    .insert(pushSubscriptions)
    .values(input)
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: {
        accountId: input.accountId,
        p256dh: input.p256dh,
        auth: input.auth,
        userAgent: input.userAgent,
      },
    });
}

export async function deletePushSubscription(accountId: string, endpoint: string) {
  await db
    .delete(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.accountId, accountId),
        eq(pushSubscriptions.endpoint, endpoint),
      ),
    );
}

export async function deletePushSubscriptionsByEndpoint(endpoints: string[]) {
  if (endpoints.length === 0) return;
  await db
    .delete(pushSubscriptions)
    .where(inArray(pushSubscriptions.endpoint, endpoints));
}

/** Subscriptions of the team's members who can read the help desk. */
export async function listHelpdeskPushSubscriptions(teamId: string) {
  const team = await db.query.teams.findFirst({ where: eq(teams.id, teamId) });
  if (!team) return [];
  const members = await db.query.teamMembers.findMany({
    where: eq(teamMembers.teamId, teamId),
  });
  const accountIds = members
    .filter((member) =>
      computeEffectivePermissions(member.permissions ?? [], {
        isOwner: member.accountId === team.ownerAccountId,
      }).includes("helpdesk:read"),
    )
    .map((member) => member.accountId);
  if (accountIds.length === 0) return [];
  return db.query.pushSubscriptions.findMany({
    where: inArray(pushSubscriptions.accountId, accountIds),
  });
}
