import { describe, expect, it } from "vitest";
import { edgeCacheHeaders, edgeCacheMode, edgeTags } from "./edge-cache";

describe("edgeTags", () => {
  it("tags pages by slug, with the shell every route renders", () => {
    expect(edgeTags("team_a", "/")).toEqual([
      "team:team_a",
      "shell:team_a",
      "page:team_a:",
    ]);
    expect(edgeTags("team_a", "/pricing/")).toEqual([
      "team:team_a",
      "shell:team_a",
      "page:team_a:pricing",
    ]);
  });

  it("tags content routes by their collection, and indexes by their page", () => {
    expect(edgeTags("team_a", "/docs/guides/intro")).toEqual([
      "team:team_a",
      "shell:team_a",
      "docs:team_a",
    ]);
    expect(edgeTags("team_a", "/blog")).toEqual([
      "team:team_a",
      "shell:team_a",
      "blog:team_a",
      "page:team_a:blog",
    ]);
    expect(edgeTags("team_a", "/changelog/rss.xml")).toContain("changelog:team_a");
    expect(edgeTags("team_a", "/sitemap.xml")).toContain("sitemap:team_a");
    expect(edgeTags("team_a", "/robots.txt")).toEqual(["team:team_a", "shell:team_a"]);
  });
});

describe("edgeCacheHeaders", () => {
  it("leaves Next's headers alone by default", () => {
    expect(edgeCacheMode(undefined)).toBe("none");
    expect(edgeCacheHeaders("team_a", "/", "none")).toBeNull();
  });

  it("caches for the TTL at the edge and never in the browser", () => {
    expect(edgeCacheHeaders("team_a", "/", "ttl", 120)).toEqual({
      "Cache-Control": "public, max-age=0, must-revalidate",
      "CDN-Cache-Control":
        "public, s-maxage=120, stale-while-revalidate=86400, stale-if-error=604800",
      "Surrogate-Control":
        "max-age=120, stale-while-revalidate=86400, stale-if-error=604800",
    });
  });

  it("caches until purged and names the tags to purge", () => {
    const headers = edgeCacheHeaders("team_a", "/docs/intro", "purge")!;
    expect(headers["CDN-Cache-Control"]).toContain("s-maxage=31536000");
    expect(headers["Surrogate-Key"]).toBe("team:team_a shell:team_a docs:team_a");
    expect(headers["Cache-Tag"]).toBe("team:team_a,shell:team_a,docs:team_a");
  });

  it("keeps per-visitor routes out of every shared cache, in every mode", () => {
    for (const mode of ["none", "ttl", "purge"] as const) {
      for (const path of [
        "/help/tickets/tkt_1",
        "/_preview/rel_1/pricing",
        "/embed/chat",
      ]) {
        expect(edgeCacheHeaders("team_a", path, mode)).toEqual({
          "Cache-Control": "private, no-store",
        });
      }
    }
    expect(edgeCacheHeaders("team_a", "/embed/chat.js", "purge")).not.toBeNull();
    expect(
      edgeCacheHeaders("team_a", "/embed/chat.js", "purge")!["Cache-Control"],
    ).toContain("public");
  });

  it("never stores a response whose rsc header and _rsc parameter disagree", () => {
    const privateOnly = { "Cache-Control": "private, no-store" };
    for (const mode of ["none", "ttl", "purge"] as const) {
      expect(
        edgeCacheHeaders("team_a", "/docs/x", mode, 60, {
          rscHeader: true,
          rscParam: false,
        }),
      ).toEqual(privateOnly);
      expect(
        edgeCacheHeaders("team_a", "/docs/x", mode, 60, {
          rscHeader: false,
          rscParam: true,
        }),
      ).toEqual(privateOnly);
      expect(
        edgeCacheHeaders("team_a", "/docs/x", mode, 60, {
          rscHeader: true,
          rscParam: true,
        }),
      ).not.toEqual(privateOnly);
    }
  });
});
