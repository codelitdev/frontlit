import { and, asc, eq, inArray, lte } from "drizzle-orm";
import type { TeamPermission } from "@frontlit/api-contract";
import { db } from "../db/client";
import {
  authorizationAuditEvents,
  type AuthorizationAuditEventType,
} from "../db/schema";

const DEFAULT_RETENTION_DAYS = 180;

export function auditExpiresAt(now = new Date()): Date {
  const days = Number(process.env.AUTHZ_AUDIT_RETENTION_DAYS);
  const retention = Number.isFinite(days) && days > 0 ? days : DEFAULT_RETENTION_DAYS;
  return new Date(now.getTime() + retention * 24 * 60 * 60 * 1000);
}

export type AuditEventInput = {
  eventType: AuthorizationAuditEventType;
  teamPublicId: string;
  actorAccountId?: string | null;
  targetMemberId?: string | null;
  targetEmail?: string | null;
  beforePermissions?: readonly TeamPermission[] | null;
  afterPermissions?: readonly TeamPermission[] | null;
  metadata?: Record<string, unknown>;
};

export async function insertAuditEvent(
  tx: Pick<typeof db, "insert">,
  input: AuditEventInput,
): Promise<void> {
  await tx.insert(authorizationAuditEvents).values({
    eventType: input.eventType,
    teamPublicId: input.teamPublicId,
    actorAccountId: input.actorAccountId ?? null,
    targetMemberId: input.targetMemberId ?? null,
    targetEmail: input.targetEmail ?? null,
    beforePermissions: input.beforePermissions ? [...input.beforePermissions] : null,
    afterPermissions: input.afterPermissions ? [...input.afterPermissions] : null,
    metadata: input.metadata ?? {},
    expiresAt: auditExpiresAt(),
  });
}

export async function deleteExpiredAuditEvents(
  now = new Date(),
  limit = 500,
): Promise<number> {
  const candidates = await db
    .select({ id: authorizationAuditEvents.id })
    .from(authorizationAuditEvents)
    .where(lte(authorizationAuditEvents.expiresAt, now))
    .orderBy(asc(authorizationAuditEvents.expiresAt))
    .limit(Math.min(Math.max(limit, 1), 500));
  if (candidates.length === 0) return 0;
  const deleted = await db
    .delete(authorizationAuditEvents)
    .where(
      inArray(
        authorizationAuditEvents.id,
        candidates.map((candidate) => candidate.id),
      ),
    )
    .returning({ id: authorizationAuditEvents.id });
  return deleted.length;
}

export async function listAuditEventsForTeam(teamPublicId: string) {
  return db
    .select()
    .from(authorizationAuditEvents)
    .where(eq(authorizationAuditEvents.teamPublicId, teamPublicId));
}

export async function listAuditEventsByType(
  teamPublicId: string,
  eventType: AuthorizationAuditEventType,
) {
  return db
    .select()
    .from(authorizationAuditEvents)
    .where(
      and(
        eq(authorizationAuditEvents.teamPublicId, teamPublicId),
        eq(authorizationAuditEvents.eventType, eventType),
      ),
    );
}
