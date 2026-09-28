import { and, eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import { aiUsageDaily } from "../db/schema";
import { genId } from "../db/id";
import { dailyTokenBudget } from "./config";

function utcDate(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

async function ensureRow(teamId: string, usageDate: string) {
  const existing = await db.query.aiUsageDaily.findFirst({
    where: and(eq(aiUsageDaily.teamId, teamId), eq(aiUsageDaily.usageDate, usageDate)),
  });
  if (existing) return existing;
  try {
    const [created] = await db
      .insert(aiUsageDaily)
      .values({ id: genId(), teamId, usageDate })
      .returning();
    return created;
  } catch {
    const raced = await db.query.aiUsageDaily.findFirst({
      where: and(
        eq(aiUsageDaily.teamId, teamId),
        eq(aiUsageDaily.usageDate, usageDate),
      ),
    });
    if (!raced) throw new Error("Failed to create AI usage row");
    return raced;
  }
}

export async function reserveTokens(teamId: string, amount: number): Promise<boolean> {
  if (amount <= 0) return true;
  const usageDate = utcDate();
  await ensureRow(teamId, usageDate);
  const budget = dailyTokenBudget();
  const [updated] = await db
    .update(aiUsageDaily)
    .set({
      reservedTokens: sql`${aiUsageDaily.reservedTokens} + ${amount}`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(aiUsageDaily.teamId, teamId),
        eq(aiUsageDaily.usageDate, usageDate),
        sql`${aiUsageDaily.reservedTokens} + ${aiUsageDaily.usedTokens} + ${amount} <= ${budget}`,
      ),
    )
    .returning();
  return Boolean(updated);
}

export async function releaseReservation(teamId: string, amount: number) {
  if (amount <= 0) return;
  const usageDate = utcDate();
  await db
    .update(aiUsageDaily)
    .set({
      reservedTokens: sql`GREATEST(${aiUsageDaily.reservedTokens} - ${amount}, 0)`,
      updatedAt: new Date(),
    })
    .where(and(eq(aiUsageDaily.teamId, teamId), eq(aiUsageDaily.usageDate, usageDate)));
}

export async function chargeReservation(
  teamId: string,
  reserved: number,
  used: number,
) {
  const usageDate = utcDate();
  const charged = Math.max(0, used);
  await db
    .update(aiUsageDaily)
    .set({
      reservedTokens: sql`GREATEST(${aiUsageDaily.reservedTokens} - ${reserved}, 0)`,
      usedTokens: sql`${aiUsageDaily.usedTokens} + ${charged}`,
      updatedAt: new Date(),
    })
    .where(and(eq(aiUsageDaily.teamId, teamId), eq(aiUsageDaily.usageDate, usageDate)));
}
