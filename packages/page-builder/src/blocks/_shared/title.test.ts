import { describe, expect, it } from "vitest";
import { renderTitle, titleProps } from "./title";

describe("titleProps", () => {
  it("defaults the heading level and adds no size classes", () => {
    expect(titleProps({}).as).toBe("h2");
    expect(titleProps({}, "h1").as).toBe("h1");
    expect(titleProps({}).sizeClassName).toBe("");
  });

  it("limits a phone-only size to phones", () => {
    const props = titleProps({ titleSize: { mobile: 30 } });
    expect(props.sizeClassName).toBe(
      "text-[length:var(--pb-title-mobile)] md:text-[length:var(--pb-title-tablet)]",
    );
    expect(props.style).toMatchObject({
      "--pb-title-mobile": "30px",
      "--pb-title-tablet": "var(--pb-theme-size, 1em)",
    });
  });

  it("falls back to the theme size for a breakpoint left empty", () => {
    const props = titleProps({
      titleLevel: "h3",
      titleSize: { mobile: 28, desktop: 56 },
    });
    expect(props.as).toBe("h3");
    expect(props.style).toMatchObject({
      "--pb-title-mobile": "28px",
      "--pb-title-tablet": "var(--pb-theme-size, 1em)",
      "--pb-title-desktop": "56px",
    });
  });

  it("keeps the theme line-height when the size is overridden", async () => {
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { createElement } = await import("react");
    const { Header1 } = await import("../../primitives/header1");
    const html = renderToStaticMarkup(
      createElement(
        Header1,
        {
          theme: {
            typography: {
              header1: {
                fontFamily: "font-inter",
                fontSize: "text-5xl",
                fontWeight: "font-bold",
                lineHeight: "leading-tight",
                fluid: { min: 32, max: 48 },
              },
            },
          } as any,
          ...titleProps({ titleSize: { mobile: 30 } }),
        },
        "Title",
      ),
    );
    expect(html).toContain("<h2");
    expect(html).toContain("leading-tight");
    expect(html).toContain("text-[length:var(--pb-title-mobile)]");
    expect(html).not.toContain("text-5xl");
  });

  it("highlights words wrapped in asterisks", async () => {
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { createElement, Fragment } = await import("react");
    const html = renderToStaticMarkup(
      createElement(
        Fragment,
        null,
        renderTitle("Run them *anywhere.* Leave them running."),
      ),
    );
    expect(html).toBe(
      'Run them <span class="text-primary">anywhere.</span> Leave them running.',
    );
    const marker = renderToStaticMarkup(
      createElement(
        Fragment,
        null,
        renderTitle("*Most* powerful", { highlight: "marker" } as any),
      ),
    );
    expect(marker).toContain("bg-primary");
    expect(renderTitle("No highlight")).toBe("No highlight");
    expect(renderTitle("A lone * stays")).toEqual(["A lone * stays"]);
  });
});
