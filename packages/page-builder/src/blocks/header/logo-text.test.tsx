import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { themes } from "../../primitives/themes";
import { HeaderWidget } from "./widget";
import { FooterWidget } from "../footer/widget";

const state = { theme: themes[0] };

describe("header and footer logo text", () => {
  it("shows the Branding site title", () => {
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

  it("renders the Branding logo and title in the header", () => {
    const html = renderToStaticMarkup(
      <HeaderWidget
        settings={{}}
        state={state}
        pageData={{ siteTitle: "Acme", siteLogoUrl: "https://example.com/logo.png" }}
      />,
    );
    expect(html).toContain("Acme");
    expect(html).toContain("https://example.com/logo.png");
  });

  it("renders no FrontLit branding in the footer without branding", () => {
    const html = renderToStaticMarkup(
      <FooterWidget settings={{}} state={state} pageData={{}} />,
    );
    expect(html).not.toContain("FrontLit");
    expect(html).not.toContain("grow your audience");
  });

  it("renders no logo or title in the header without branding", () => {
    const html = renderToStaticMarkup(
      <HeaderWidget settings={{}} state={state} pageData={{}} />,
    );
    expect(html).not.toContain("FrontLit");
    expect(html).not.toContain("<svg viewBox");
    expect(html).not.toContain("<img");
  });
});
