import { describe, expect, it } from "vitest";
import { pageMetadata, resolveSeo, titleTemplate } from "./seo";

describe("resolveSeo", () => {
  it("falls all the way through to the deployment's site name when nothing is set", () => {
    const resolved = resolveSeo({}, null, "FrontLit");
    expect(resolved).toEqual({
      title: "FrontLit",
      description: null,
      imageUrl: null,
      robotsIndex: true,
    });
  });

  it("prefers the page/entity title, then falls back to the page name, then the site title", () => {
    expect(
      resolveSeo({ title: "About us" }, { title: "Acme" } as any, "FrontLit").title,
    ).toBe("About us");
    expect(
      resolveSeo({ fallbackName: "About" }, { title: "Acme" } as any, "FrontLit").title,
    ).toBe("About");
    expect(resolveSeo({}, { title: "Acme" } as any, "FrontLit").title).toBe("Acme");
  });

  it("falls description back to the site subtitle", () => {
    expect(
      resolveSeo({ description: "Custom" }, { subtitle: "Tagline" } as any, "FrontLit")
        .description,
    ).toBe("Custom");
    expect(resolveSeo({}, { subtitle: "Tagline" } as any, "FrontLit").description).toBe(
      "Tagline",
    );
  });

  it("falls the image back to the team logo", () => {
    const site = { logo: { url: "https://cdn/logo.png" } } as any;
    expect(
      resolveSeo({ image: { url: "https://cdn/page.png" } }, site, "FrontLit").imageUrl,
    ).toBe("https://cdn/page.png");
    expect(
      resolveSeo({ image: "https://cdn/raw.png" }, site, "FrontLit").imageUrl,
    ).toBe("https://cdn/raw.png");
    expect(
      resolveSeo({ image: { file: "https://cdn/medialit.png" } }, site, "FrontLit")
        .imageUrl,
    ).toBe("https://cdn/medialit.png");
    expect(
      resolveSeo({ image: { src: "https://cdn/src.png" } }, site, "FrontLit").imageUrl,
    ).toBe("https://cdn/src.png");
    expect(resolveSeo({}, site, "FrontLit").imageUrl).toBe("https://cdn/logo.png");
    expect(resolveSeo({}, null, "FrontLit").imageUrl).toBeNull();
  });

  it("only disallows robots when explicitly false — null/undefined default to indexable", () => {
    expect(resolveSeo({ robotsAllowed: false }, null, "FrontLit").robotsIndex).toBe(
      false,
    );
    expect(resolveSeo({ robotsAllowed: null }, null, "FrontLit").robotsIndex).toBe(
      true,
    );
    expect(resolveSeo({}, null, "FrontLit").robotsIndex).toBe(true);
  });
});

describe("titleTemplate", () => {
  it("uses the site's branded title, falling back to the deployment name", () => {
    expect(titleTemplate({ title: "Acme" } as any, "FrontLit")).toBe("Acme");
    expect(titleTemplate(null, "FrontLit")).toBe("FrontLit");
  });
});

describe("pageMetadata", () => {
  const blogPage = {
    slug: "blog",
    name: "Blog",
    title: "Engineering blog",
    description: "What we ship",
    socialImage: null,
    robotsAllowed: false,
  };
  const url = "https://acme.example/blog";

  it("renders noindex for a feed index page that disallows robots", () => {
    const metadata = pageMetadata({
      page: blogPage,
      settings: null,
      siteName: "Acme",
      url,
    });
    // Links stay followed so the listed articles are still discovered.
    expect(metadata.robots).toEqual({ index: false, follow: true });
    expect(metadata.title).toBe("Engineering blog");
    expect(metadata.description).toBe("What we ship");
    expect(metadata.alternates).toEqual({ canonical: url });
  });

  it("indexes pages by default and names an unpublished feed index", () => {
    const metadata = pageMetadata({
      page: null,
      settings: null,
      siteName: "Acme",
      url,
      fallbackName: "Blog",
    });
    expect(metadata.robots).toEqual({ index: true, follow: true });
    expect(metadata.title).toBe("Blog");
  });

  it("renders noindex when the site is hidden from search", () => {
    const metadata = pageMetadata({
      page: { ...blogPage, robotsAllowed: true },
      settings: { hideFromSearch: true } as any,
      siteName: "Acme",
      url,
    });
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it("gives the homepage an absolute title", () => {
    const metadata = pageMetadata({
      page: { ...blogPage, slug: "", title: null, robotsAllowed: true },
      settings: { title: "Acme" } as any,
      siteName: "FrontLit",
      url: "https://acme.example/",
    });
    expect(metadata.title).toEqual({ absolute: "Acme" });
  });
});
