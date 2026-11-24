import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { themes } from "../../primitives/themes";
import { FooterWidget } from "./widget";
import { parseSiteFile } from "../../schema/files";

const state = { theme: themes[0] };
const logo = "https://example.com/logo.png";
const pageData = { siteTitle: "Acme", siteLogoUrl: logo };

describe("footer logo and social links", () => {
  it("shows the Branding logo by default and hides it when switched off", () => {
    const render = (showLogo?: boolean) =>
      renderToStaticMarkup(
        <FooterWidget settings={{ showLogo }} state={state} pageData={pageData} />,
      );
    expect(render()).toContain(logo);
    const hidden = render(false);
    expect(hidden).not.toContain(logo);
    expect(hidden).toContain("Acme");
  });

  it("renders an icon link only for platforms with a URL", () => {
    for (const layout of ["columns", "centered", "minimal"] as const) {
      const html = renderToStaticMarkup(
        <FooterWidget
          settings={{
            layout,
            socials: { linkedin: "https://linkedin.com/company/acme", github: "" },
          }}
          state={state}
          pageData={pageData}
        />,
      );
      expect(html).toContain('href="https://linkedin.com/company/acme"');
      expect(html).toContain('aria-label="LinkedIn"');
      expect(html).not.toContain('aria-label="GitHub"');
    }
  });

  it("accepts showLogo and socials in site.json", () => {
    const footer = {
      showLogo: false,
      socials: { twitter: "https://x.com/acme", github: "" },
    };
    expect(parseSiteFile(JSON.stringify({ footer })).footer).toMatchObject(footer);
    expect(() =>
      parseSiteFile(
        JSON.stringify({ footer: { socials: { tiktok: "https://t.co" } } }),
      ),
    ).toThrow();
  });
});
