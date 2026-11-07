import { describe, expect, it, vi } from "vitest";

const entry = (slug: string, overrides: Record<string, unknown> = {}) => ({
  documentId: `doc_${slug}`,
  slug,
  title: `Entry ${slug}`,
  excerpt: null,
  content: {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: `Body of ${slug} <b>` }] },
    ],
  },
  featuredImage: null,
  meta: {},
  publishedAt: "2026-11-08T23:30:00.000Z",
  updatedAt: null,
  ...overrides,
});

vi.mock("@/lib/api", () => ({
  getSettings: async () => ({ title: "Acme", subtitle: null }),
  getCanonicalHost: async () => "acme.com",
  listProductUpdates: async () => ({
    items: [
      entry("dark-mode", { meta: { releaseDate: "2026-11-07" } }),
      entry("faster-exports", { excerpt: "Exports are 2x faster." }),
    ],
    total: 2,
  }),
}));
vi.mock("@/lib/docs-tree", () => ({}));

const { GET } = await import("./route");

describe("changelog RSS feed", () => {
  it("gives every entry its own anchor link and guid", async () => {
    const xml = await (
      await GET(new Request("https://acme.com/changelog/rss.xml"), {
        params: Promise.resolve({ teamId: "team_1" }),
      })
    ).text();

    expect(xml).toContain("<guid>https://acme.com/changelog#dark-mode</guid>");
    expect(xml).toContain("<link>https://acme.com/changelog#faster-exports</link>");
    // Release date wins over the publish date; date-only values are UTC days.
    expect(xml).toContain("<pubDate>Sat, 07 Nov 2026 00:00:00 GMT</pubDate>");
    expect(xml).toContain("<pubDate>Sun, 08 Nov 2026 00:00:00 GMT</pubDate>");
    // Excerpt when set, otherwise an escaped summary of the body.
    expect(xml).toContain("<description>Exports are 2x faster.</description>");
    expect(xml).toContain("<description>Body of dark-mode &lt;b&gt;</description>");
  });
});
