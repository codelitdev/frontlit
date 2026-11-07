import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeTestDb, seedTeam, type TestDb } from "../test/db";

vi.mock("../db/client", async () => ({ db: await makeTestDb() }));
vi.mock("../ai/queries", () => ({
  getResolvedEmbeddingConfig: vi.fn(async () => ({
    provider: "openai",
    apiKey: "sk-test",
    deployment: null,
    endpoint: null,
  })),
}));
// A toy embedding space: "refund" and "money back" mean the same thing.
vi.mock("../ai/embeddings", async () => {
  const actual =
    await vi.importActual<typeof import("../ai/embeddings")>("../ai/embeddings");
  const embed = (text: string) => {
    const vector = new Array(1536).fill(0);
    const lower = text.toLowerCase();
    if (/refund|money back/.test(lower)) vector[0] = 1;
    else vector[1] = 1;
    return vector;
  };
  return {
    ...actual,
    getEmbeddings: vi.fn(async (texts: string[]) => ({
      embeddings: texts.map(embed),
      usedTokens: texts.length,
    })),
  };
});

import { and, eq, isNotNull } from "drizzle-orm";
import { db as testDb } from "../db/client";
import { searchChunks } from "../db/schema";
import { createDocument, publishDocument, updateDocument } from "../documents/queries";
import { getResolvedEmbeddingConfig } from "../ai/queries";
import { embedSearchChunks, syncSearchChunks } from "./indexer";
import { searchContent } from "./search";

const db = testDb as unknown as TestDb;

async function publishDoc(teamId: string, title: string, text: string) {
  const created = await createDocument("doc", { teamId, title });
  await updateDocument("doc", teamId, created.documentId, {
    expectedDraftVersion: 1,
    content: {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text }] }],
    } as any,
  });
  await publishDocument("doc", teamId, created.documentId, 2);
  return created.documentId;
}

describe("hybrid search", () => {
  let teamId: string;
  beforeEach(async () => {
    teamId = (await seedTeam(db)).team.id;
  });

  it("finds a paraphrase that shares no words with the content", async () => {
    const refunds = await publishDoc(
      teamId,
      "Refunds",
      "Refund requests are approved in 30 days.",
    );
    await publishDoc(teamId, "Install", "Run the installer on macOS or Linux.");
    await syncSearchChunks(teamId);
    expect(await embedSearchChunks(teamId)).toBe(false);

    const rows = await (db as any)
      .select()
      .from(searchChunks)
      .where(and(eq(searchChunks.teamId, teamId), isNotNull(searchChunks.embedding)));
    expect(rows).toHaveLength(2);
    expect(rows[0].embeddingModel).toBe("openai:text-embedding-3-small");

    const [hit] = await searchContent(teamId, "get my money back");
    expect(hit?.documentId).toBe(refunds);
  });

  it("clears vectors when the team removes its embedding key", async () => {
    await publishDoc(teamId, "Refunds", "Refund requests are approved in 30 days.");
    await syncSearchChunks(teamId);
    await embedSearchChunks(teamId);
    vi.mocked(getResolvedEmbeddingConfig).mockResolvedValueOnce(null);
    await embedSearchChunks(teamId);
    const rows = await (db as any)
      .select()
      .from(searchChunks)
      .where(and(eq(searchChunks.teamId, teamId), isNotNull(searchChunks.embedding)));
    expect(rows).toEqual([]);
  });
});
