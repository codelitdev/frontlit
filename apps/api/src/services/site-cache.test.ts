import { describe, expect, it } from "vitest";
import { signWebhookPayload } from "./webhook-signing";
import { releaseChangeTags, revalidateRequest } from "./site-cache";

const site = { header: { links: [] }, footer: {} };
const page = (pageId: string | null, slug: string, revisionId: string) => ({
  pageId,
  slug,
  revisionId,
});

describe("releaseChangeTags", () => {
  it("tags only the page whose revision changed", () => {
    const before = { site, pages: [page("a", "", "r1"), page("b", "pricing", "r2")] };
    const after = { site, pages: [page("a", "", "r1"), page("b", "pricing", "r3")] };
    expect(releaseChangeTags("team_x", before, after)).toEqual([
      "page:team_x:pricing",
      "sitemap:team_x",
    ]);
  });

  it("tags the old and new slug of a moved page", () => {
    const before = { site, pages: [page("b", "pricing", "r2")] };
    const after = { site, pages: [page("b", "plans", "r2")] };
    expect(releaseChangeTags("team_x", before, after)).toEqual([
      "page:team_x:pricing",
      "page:team_x:plans",
      "sitemap:team_x",
    ]);
  });

  it("tags published and removed pages, including Git pages without an ID", () => {
    const before = { site, pages: [page(null, "guide", "r1")] };
    const after = { site, pages: [page("c", "new", "r5")] };
    expect(releaseChangeTags("team_x", before, after)).toEqual([
      "page:team_x:guide",
      "page:team_x:new",
      "sitemap:team_x",
    ]);
  });

  it("tags the shell when the header, footer or theme changed", () => {
    const pages = [page("a", "", "r1")];
    const after = { site: { ...site, footer: { tagline: "new" } }, pages };
    expect(releaseChangeTags("team_x", { site, pages }, after)).toEqual([
      "shell:team_x",
    ]);
  });

  it("returns nothing for an identical release", () => {
    const release = { site, pages: [page("a", "", "r1")] };
    expect(releaseChangeTags("team_x", release, { ...release })).toEqual([]);
  });
});

describe("revalidateRequest", () => {
  it("signs { eventId, teamId, tags, invalidateHosts }", () => {
    const { url, init } = revalidateRequest(
      {
        eventId: "evt_1",
        tags: ["team:team_abc"],
        invalidateHosts: ["acme.localhost"],
      },
      "team_abc",
      "secret",
      "http://sites.test",
      1000,
    );
    expect(url).toBe("http://sites.test/api/webhooks/revalidate");
    const body = String(init.body);
    expect(JSON.parse(body)).toEqual({
      eventId: "evt_1",
      teamId: "team_abc",
      tags: ["team:team_abc"],
      invalidateHosts: ["acme.localhost"],
    });
    const headers = init.headers as Record<string, string>;
    expect(headers["x-frontlit-signature"]).toBe(
      signWebhookPayload("secret", body, 1000),
    );
  });

  it("omits invalidateHosts when there are none", () => {
    const { init } = revalidateRequest(
      { eventId: "evt_1", tags: ["shell:team_abc"], invalidateHosts: null },
      "team_abc",
      "secret",
      "http://sites.test",
    );
    expect(JSON.parse(String(init.body))).not.toHaveProperty("invalidateHosts");
  });
});
