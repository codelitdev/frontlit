import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { themes } from "../../primitives/themes";
import { HeaderWidget } from "./widget";
import { FooterWidget } from "../footer/widget";

const state = { theme: themes[0] };

describe("header and footer logo text", () => {
  it("falls back to the site title when logo text is empty", () => {
    const pageData = { siteTitle: "Acme" };
    expect(
      renderToStaticMarkup(
        <HeaderWidget settings={{}} state={state} pageData={pageData} />,
      ),
    ).toContain("Acme");
    expect(
      renderToStaticMarkup(
        <FooterWidget settings={{}} state={state} pageData={pageData} />,
      ),
    ).toContain("Acme");
  });

  it("uses the site subtitle as the footer tagline", () => {
    const html = renderToStaticMarkup(
      <FooterWidget
        settings={{}}
        state={state}
        pageData={{ siteTitle: "Acme", siteSubtitle: "Tools for teams" }}
      />,
    );
    expect(html).toContain("Tools for teams");
    expect(html).not.toContain("grow your audience");
  });

  it("prefers the block's own logo text", () => {
    const html = renderToStaticMarkup(
      <HeaderWidget
        settings={{ logoText: "Acme Docs" }}
        state={state}
        pageData={{ siteTitle: "Acme" }}
      />,
    );
    expect(html).toContain("Acme Docs");
  });

  it("shows FrontLit's mark and name until the site has branding", () => {
    const header = renderToStaticMarkup(
      <HeaderWidget settings={{}} state={state} pageData={{}} />,
    );
    expect(header).toContain("FrontLit");
    expect(header).toContain("<svg");
    expect(
      renderToStaticMarkup(<FooterWidget settings={{}} state={state} pageData={{}} />),
    ).toContain("FrontLit");
  });

  it("keeps the FrontLit mark until the site has a logo", () => {
    const withTitle = renderToStaticMarkup(
      <HeaderWidget settings={{}} state={state} pageData={{ siteTitle: "Acme" }} />,
    );
    expect(withTitle).not.toContain(">FrontLit<");
    expect(withTitle).toContain('viewBox="0 0 64 64"');

    const withLogo = renderToStaticMarkup(
      <HeaderWidget
        settings={{}}
        state={state}
        pageData={{ siteLogoUrl: "https://example.com/logo.png" }}
      />,
    );
    expect(withLogo).not.toContain("FrontLit");
    expect(withLogo).not.toContain('viewBox="0 0 64 64"');
  });
});
