import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { aiSettings, type DocumentKind } from "../db/schema";

export async function teamIndexesKind(
    teamId: string,
    kind: DocumentKind,
): Promise<boolean> {
    if (kind === "doc") return true;
    const row = await db.query.aiSettings.findFirst({
        where: eq(aiSettings.teamId, teamId),
        columns: { indexArticles: true, indexChangelog: true },
    });
    if (!row) return false;
    if (kind === "blog") return row.indexArticles;
    if (kind === "changelog") return row.indexChangelog;
    return false;
}
