import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { inboxAiSettings, type InboxAiChannel } from "../db/schema";
import { normalizeInboxText } from "./normalize";

export type InboxAiPolicy = {
  channel: InboxAiChannel;
  autoReply: boolean;
  escalateOnVisitorRequest: boolean;
  escalateWhenUnsure: boolean;
  escalateTopics: string[];
  escalateAfterBotTurns: number | null;
  createdAt: Date;
  updatedAt: Date;
};

export type InboxAiPolicyPatch = Partial<{
  autoReply: boolean;
  escalateOnVisitorRequest: boolean;
  escalateWhenUnsure: boolean;
  escalateTopics: string[];
  escalateAfterBotTurns: number | null;
}>;

export class InboxAiPolicyError extends Error {
  constructor(
    public readonly code: "invalid_policy" | "ai_required",
    message: string,
  ) {
    super(message);
    this.name = "InboxAiPolicyError";
  }
}

export function defaultInboxAiPolicy(channel: InboxAiChannel): InboxAiPolicy {
  return {
    channel,
    autoReply: false,
    escalateOnVisitorRequest: true,
    escalateWhenUnsure: true,
    escalateTopics: [],
    escalateAfterBotTurns: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}

export function normalizeTopics(topics: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const topic of topics) {
    const normalized = normalizeInboxText(topic);
    if (!normalized) {
      throw new InboxAiPolicyError(
        "invalid_policy",
        "escalateTopics cannot contain empty entries.",
      );
    }
    if (normalized.length > 80) {
      throw new InboxAiPolicyError(
        "invalid_policy",
        "Each escalateTopics entry must be 1–80 characters after normalization.",
      );
    }
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  if (result.length > 20) {
    throw new InboxAiPolicyError(
      "invalid_policy",
      "escalateTopics may contain at most 20 entries.",
    );
  }
  return result;
}

export function validateTurnCap(value: number | null): number | null {
  if (value === null) return null;
  if (!Number.isInteger(value) || value < 1 || value > 100) {
    throw new InboxAiPolicyError(
      "invalid_policy",
      "escalateAfterBotTurns must be null or an integer from 1 through 100.",
    );
  }
  return value;
}

function fromRow(row: typeof inboxAiSettings.$inferSelect): InboxAiPolicy {
  return {
    channel: row.channel,
    autoReply: row.autoReply,
    escalateOnVisitorRequest: row.escalateOnVisitorRequest,
    escalateWhenUnsure: row.escalateWhenUnsure,
    escalateTopics: row.escalateTopics ?? [],
    escalateAfterBotTurns: row.escalateAfterBotTurns,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function getInboxAiPolicy(
  teamId: string,
  channel: InboxAiChannel,
): Promise<InboxAiPolicy> {
  const row = await db.query.inboxAiSettings.findFirst({
    where: and(
      eq(inboxAiSettings.teamId, teamId),
      eq(inboxAiSettings.channel, channel),
    ),
  });
  return row ? fromRow(row) : defaultInboxAiPolicy(channel);
}

export async function listInboxAiPolicies(teamId: string): Promise<InboxAiPolicy[]> {
  const rows = await db.query.inboxAiSettings.findMany({
    where: eq(inboxAiSettings.teamId, teamId),
  });
  const byChannel = new Map(rows.map((row) => [row.channel, fromRow(row)]));
  return [
    byChannel.get("chatbot") ?? defaultInboxAiPolicy("chatbot"),
    byChannel.get("tickets") ?? defaultInboxAiPolicy("tickets"),
  ];
}

export async function upsertInboxAiPolicy(
  teamId: string,
  channel: InboxAiChannel,
  patch: InboxAiPolicyPatch,
): Promise<InboxAiPolicy> {
  const existing = await db.query.inboxAiSettings.findFirst({
    where: and(
      eq(inboxAiSettings.teamId, teamId),
      eq(inboxAiSettings.channel, channel),
    ),
  });
  const nextTopics =
    patch.escalateTopics === undefined
      ? undefined
      : normalizeTopics(patch.escalateTopics);
  const nextCap =
    patch.escalateAfterBotTurns === undefined
      ? undefined
      : validateTurnCap(patch.escalateAfterBotTurns);

  if (existing) {
    const [updated] = await db
      .update(inboxAiSettings)
      .set({
        ...(patch.autoReply !== undefined ? { autoReply: patch.autoReply } : {}),
        ...(patch.escalateOnVisitorRequest !== undefined
          ? {
              escalateOnVisitorRequest: patch.escalateOnVisitorRequest,
            }
          : {}),
        ...(patch.escalateWhenUnsure !== undefined
          ? { escalateWhenUnsure: patch.escalateWhenUnsure }
          : {}),
        ...(nextTopics !== undefined ? { escalateTopics: nextTopics } : {}),
        ...(nextCap !== undefined ? { escalateAfterBotTurns: nextCap } : {}),
        updatedAt: new Date(),
      })
      .where(eq(inboxAiSettings.id, existing.id))
      .returning();
    return fromRow(updated);
  }

  const [created] = await db
    .insert(inboxAiSettings)
    .values({
      teamId,
      channel,
      autoReply: patch.autoReply ?? false,
      escalateOnVisitorRequest: patch.escalateOnVisitorRequest ?? true,
      escalateWhenUnsure: patch.escalateWhenUnsure ?? true,
      escalateTopics: nextTopics ?? [],
      escalateAfterBotTurns: nextCap ?? null,
    })
    .returning();
  return fromRow(created);
}
