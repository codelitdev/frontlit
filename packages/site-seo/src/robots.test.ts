import { describe, expect, it } from "vitest";
import { AI_SEARCH_CRAWLERS, AI_TRAINING_CRAWLERS, buildRobotsTxt } from "./robots";

/** The rules for one user agent, as a crawler reads them: the group that
 * names it, else the `*` group. */
function rulesFor(txt: string, agent: string): string[] {
  const groups = txt.split("\n\n").map((block) => block.split("\n"));
  const named = groups.find((lines) => lines.includes(`User-agent: ${agent}`));
  const group = named ?? groups.find((lines) => lines.includes("User-agent: *"))!;
  return group.filter((line) => /^(Allow|Disallow):/.test(line));
}

describe("buildRobotsTxt", () => {
  const options = { canonicalHost: "acme.com", disallow: ["/embed/"] };

  it("lets everyone crawl except the disallowed paths and links the sitemap", () => {
    const txt = buildRobotsTxt(options);
    expect(rulesFor(txt, "Googlebot")).toEqual(["Allow: /", "Disallow: /embed/"]);
    expect(txt).toContain("Sitemap: https://acme.com/sitemap.xml");
    expect(txt.endsWith("\n")).toBe(true);
  });

  it("allows AI search crawlers by name", () => {
    const txt = buildRobotsTxt({ ...options, blockAiTraining: true });
    for (const agent of AI_SEARCH_CRAWLERS)
      expect(rulesFor(txt, agent)).toEqual(["Allow: /", "Disallow: /embed/"]);
  });

  it("blocks AI training crawlers only when asked", () => {
    const blocked = buildRobotsTxt({ ...options, blockAiTraining: true });
    const open = buildRobotsTxt(options);
    for (const agent of AI_TRAINING_CRAWLERS) {
      expect(rulesFor(blocked, agent)).toEqual(["Disallow: /"]);
      expect(rulesFor(open, agent)).toEqual(["Allow: /", "Disallow: /embed/"]);
    }
  });

  it("blocks every crawler while the site is hidden", () => {
    expect(buildRobotsTxt({ ...options, hidden: true, blockAiTraining: true })).toBe(
      "User-agent: *\nDisallow: /\n",
    );
  });

  it("never lists a crawler as both search and training", () => {
    const search = new Set<string>(AI_SEARCH_CRAWLERS);
    expect(AI_TRAINING_CRAWLERS.filter((agent) => search.has(agent))).toEqual([]);
  });
});
