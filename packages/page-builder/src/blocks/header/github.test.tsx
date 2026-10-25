import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { themes } from "../../primitives/themes";
import { HeaderWidget } from "./widget";
import { formatStars, parseGithubRepo } from "./github";
import type { HeaderSettings } from "./settings";

const state = { theme: themes[0] };
const render = (settings: HeaderSettings) =>
  renderToStaticMarkup(
    <HeaderWidget settings={settings} state={state} pageData={{ siteTitle: "Acme" }} />,
  );

describe("header GitHub link", () => {
  it.each([
    ["codelitdev/medialit", "codelitdev/medialit"],
    ["https://github.com/codelitdev/medialit", "codelitdev/medialit"],
    ["https://github.com/codelitdev/medialit/", "codelitdev/medialit"],
    ["github.com/codelitdev/medialit", undefined],
    ["medialit", undefined],
    ["", undefined],
  ])("parses %j", (value, repo) => {
    expect(parseGithubRepo(value)).toBe(repo);
  });

  it("formats star counts compactly", () => {
    expect(formatStars(20)).toBe("20");
    expect(formatStars(1234)).toBe("1.2k");
  });

  it("is hidden by default", () => {
    expect(render({})).not.toContain("github.com");
  });

  it.each(["fixed", "floating", "centered"] as const)(
    "links to the repo in a new tab (%s layout)",
    (layout) => {
      const html = render({
        layout,
        githubRepo: "https://github.com/codelitdev/medialit",
      });
      expect(html).toContain('href="https://github.com/codelitdev/medialit"');
      expect(html).toContain('target="_blank"');
      expect(html).toContain("GitHub repository");
    },
  );
});

describe("header mobile menu", () => {
  it("is hidden when there are no links or CTA", () => {
    expect(render({ links: [] })).not.toContain("Toggle menu");
    expect(render({ links: [], ctaLabel: "Go" })).not.toContain("Toggle menu");
  });

  it("shows for links or a CTA", () => {
    expect(render({ links: [{ id: "1", label: "Docs", href: "/docs" }] })).toContain(
      "Toggle menu",
    );
    expect(render({ links: [], ctaLabel: "Go", ctaHref: "/go" })).toContain(
      "Toggle menu",
    );
  });
});
