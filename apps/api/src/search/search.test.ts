import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeTestDb, seedTeam, type TestDb } from "../test/db";

vi.mock("../db/client", async () => ({ db: await makeTestDb() }));

import { and, eq, sql } from "drizzle-orm";
import { db as testDb } from "../db/client";
import { aiSettings, searchChunks, searchIndexRequests } from "../db/schema";
import { createDocument, publishDocument, updateDocument } from "../documents/queries";
import { createPage, publishPage, updatePage } from "../pages/queries";
import { drainSearchIndex, requestSearchIndex, syncSearchChunks } from "./indexer";
import { reciprocalRankFusion, searchContent, toTsQuery } from "./search";
import { extractPageChunks } from "./extract";
import { parseRanking } from "./rerank";

const db = testDb as unknown as TestDb;
const anyDb = db as any;

function paragraph(text: string) {
  return { type: "paragraph", content: [{ type: "text", text }] };
}
function heading(text: string) {
  return { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text }] };
}

async function publishDoc(teamId: string, title: string, nodes: unknown[]) {
  const created = await createDocument("doc", { teamId, title });
  await updateDocument("doc", teamId, created.documentId, {
    expectedDraftVersion: 1,
    content: { type: "doc", content: nodes as any },
  });
  await publishDocument("doc", teamId, created.documentId, 2);
  return created.documentId;
}

const chrome = (name: "header" | "footer") => ({
  widgetId: `${name}-1`,
  name,
  deletable: false,
  moveable: false,
  shared: true,
  settings: {},
});
const withChrome = (body: unknown[]) =>
  [chrome("header"), ...body, chrome("footer")] as any;

async function publishBuilderPage(teamId: string, name: string, layout: unknown[]) {
  const page = await createPage({ teamId, name });
  await updatePage(teamId, page.pageId, { layout: withChrome(layout) });
  await publishPage(teamId, page.pageId);
  return page;
}

describe("query helpers", () => {
  it("ORs the query's words and prefix-matches longer ones", () => {
    expect(toTsQuery("How do I cancel my plan?")).toBe(
      "how:* | do | i | cancel:* | my | plan:*",
    );
    expect(toTsQuery("  !!! ")).toBeNull();
  });

  it("ranks items found by several lists above single-list hits", () => {
    const fused = reciprocalRankFusion(
      [
        ["a", "b", "c"],
        ["c", "d"],
      ],
      (x) => x,
    );
    expect(fused[0].item).toBe("c");
    expect(fused.map((f) => f.item)).toEqual(["c", "a", "b", "d"]);
    expect(fused[0].similarity).toBeLessThanOrEqual(1);
  });

  it("parses the reranker's reply and ignores out-of-range numbers", () => {
    expect(parseRanking("[3, 1, 3, 9]", 4)).toEqual([2, 0]);
    expect(parseRanking("Sure! [2]", 4)).toEqual([1]);
    expect(parseRanking("[]", 4)).toEqual([]);
    expect(parseRanking("passage two", 4)).toBeNull();
  });
});

describe("page extraction", () => {
  it("indexes visible copy per block and skips chrome, links and styling", () => {
    const chunks = extractPageChunks({
      layout: [
        { name: "header", settings: { links: [{ label: "Docs", href: "/docs" }] } },
        {
          name: "hero",
          settings: {
            title: "Ship docs faster",
            description: {
              type: "doc",
              content: [paragraph("Write once, publish everywhere.")],
            },
            buttonCaption: "Get started",
            buttonAction: "https://example.com/signup",
            alignment: "left",
          },
        },
        {
          name: "faq",
          settings: {
            title: "FAQ",
            items: [
              { answer: "Yes, forever.", id: "x1", question: "Is there a free plan?" },
            ],
          },
        },
        { name: "embed", settings: { code: "<script>alert(1)</script>" } },
      ],
    } as any);
    expect(chunks).toEqual([
      {
        heading: "Ship docs faster",
        anchor: null,
        content: "Write once, publish everywhere.\nGet started",
      },
      { heading: "FAQ", anchor: null, content: "Is there a free plan?\nYes, forever." },
    ]);
  });
});

describe("searchContent", () => {
  let teamId: string;

  beforeEach(async () => {
    teamId = (await seedTeam(db)).team.id;
  });

  it("finds published docs by keyword with stemming, a docs URL and live evidence ids", async () => {
    const documentId = await publishDoc(teamId, "Refunds", [
      heading("Refund policy"),
      paragraph(
        "We offer a full refund within 30 days of purchase, no questions asked.",
      ),
    ]);
    await syncSearchChunks(teamId);

    const results = await searchContent(teamId, "refunding purchases");
    expect(results[0]).toMatchObject({
      documentId,
      kind: "doc",
      heading: "Refund policy",
      anchor: "refund-policy",
    });
    expect(results[0].url).toMatch(/\/docs\/refunds#refund-policy$/);
    expect(results[0].revisionId).toBeTruthy();
    expect(results[0].evidenceId).toBe(`${results[0].revisionId}:0`);
  });

  it("answers from published builder pages, linking to the page", async () => {
    await publishBuilderPage(teamId, "Pricing", [
      {
        widgetId: "w1",
        name: "faq",
        deletable: true,
        moveable: true,
        shared: false,
        settings: {
          title: "Pricing questions",
          items: [
            {
              question: "Can I cancel anytime?",
              answer: "Yes, cancel from billing settings.",
            },
          ],
        },
      },
    ]);
    await syncSearchChunks(teamId);

    const [hit] = await searchContent(teamId, "cancel subscription");
    expect(hit).toMatchObject({
      kind: "page",
      slug: "pricing",
      heading: "Pricing questions",
    });
    expect(hit.url).toMatch(/\/pricing$/);
    expect(hit.revisionId).toBeUndefined();
  });

  it("only returns blog posts when the team indexes articles", async () => {
    const post = await createDocument("blog", { teamId, title: "Launch week" });
    await updateDocument("blog", teamId, post.documentId, {
      expectedDraftVersion: 1,
      content: {
        type: "doc",
        content: [paragraph("Introducing webhooks for every plan.")],
      },
    });
    await publishDocument("blog", teamId, post.documentId);
    await syncSearchChunks(teamId);
    expect(await searchContent(teamId, "webhooks")).toEqual([]);

    await anyDb
      .insert(aiSettings)
      .values({ teamId, provider: "openai", indexArticles: true });
    await syncSearchChunks(teamId);
    const [hit] = await searchContent(teamId, "webhooks");
    expect(hit).toMatchObject({ kind: "blog", documentId: post.documentId });
    expect(hit.url).toMatch(/\/blog\/launch-week$/);
  });

  it("never returns content that is no longer live, even before reindexing", async () => {
    const block = (text: string) => ({
      widgetId: "w1",
      name: "rich-text",
      deletable: true,
      moveable: true,
      shared: false,
      settings: { text: { type: "doc", content: [paragraph(text)] } },
    });
    const page = await publishBuilderPage(teamId, "Offer", [
      block("Lifetime discount coupon"),
    ]);
    await syncSearchChunks(teamId);
    expect(await searchContent(teamId, "coupon")).toHaveLength(1);

    // Republish with new copy. The old revision's chunks stay until the
    // worker runs, but they are no longer live so search skips them.
    await updatePage(teamId, page.pageId, {
      layout: withChrome([block("Annual plan savings")]),
    });
    await publishPage(teamId, page.pageId);
    expect(await searchContent(teamId, "coupon")).toEqual([]);

    await syncSearchChunks(teamId);
    expect(await searchContent(teamId, "savings")).toHaveLength(1);
    const rows = await anyDb
      .select()
      .from(searchChunks)
      .where(and(eq(searchChunks.teamId, teamId), eq(searchChunks.kind, "page")));
    expect(rows.map((row: any) => row.content)).toEqual(["Annual plan savings"]);
  });

  it("is scoped to the team", async () => {
    await publishDoc(teamId, "Secrets", [
      paragraph("Team one private onboarding steps."),
    ]);
    await syncSearchChunks(teamId);
    const other = (await seedTeam(db)).team.id;
    await syncSearchChunks(other);
    expect(await searchContent(other, "onboarding")).toEqual([]);
  });

  it("reconciles through the request queue and drops unpublished sources", async () => {
    await publishDoc(teamId, "Install", [
      paragraph("Run the installer to get started."),
    ]);
    const queued = await anyDb
      .select()
      .from(searchIndexRequests)
      .where(eq(searchIndexRequests.teamId, teamId));
    // Docs activation reaches the index through the delivery outbox; queue directly here.
    if (!queued.length) await requestSearchIndex(teamId);
    await drainSearchIndex();
    expect(await searchContent(teamId, "installer")).toHaveLength(1);
    expect(
      await anyDb
        .select()
        .from(searchIndexRequests)
        .where(eq(searchIndexRequests.teamId, teamId)),
    ).toEqual([]);
  });

  it("does no work when nothing changed, including pages without text", async () => {
    await publishBuilderPage(teamId, "Contact", [
      {
        widgetId: "w1",
        name: "support-form",
        deletable: true,
        moveable: true,
        shared: false,
        settings: { title: "" },
      },
    ]);
    await publishDoc(teamId, "Install", [paragraph("Run the installer.")]);
    expect(await syncSearchChunks(teamId)).toBeGreaterThan(0);
    expect(await syncSearchChunks(teamId)).toBe(0);
  });

  it("clears a request written with database timestamps", async () => {
    await anyDb.execute(
      sql`insert into search_index_requests (team_id, requested_at, next_attempt_at) values (${teamId}, timezone('utc', now()) - interval '1 second', timezone('utc', now()) - interval '1 second')`,
    );
    await drainSearchIndex(3);
    expect(
      await anyDb
        .select()
        .from(searchIndexRequests)
        .where(eq(searchIndexRequests.teamId, teamId)),
    ).toEqual([]);
  });
});
