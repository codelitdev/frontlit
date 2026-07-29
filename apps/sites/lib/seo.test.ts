import { describe, expect, it } from "vitest";
import { resolveSeo, titleTemplate } from "./seo";

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
            resolveSeo(
                { title: "About us" },
                { title: "Acme" } as any,
                "FrontLit",
            ).title,
        ).toBe("About us");
        expect(
            resolveSeo(
                { fallbackName: "About" },
                { title: "Acme" } as any,
                "FrontLit",
            ).title,
        ).toBe("About");
        expect(resolveSeo({}, { title: "Acme" } as any, "FrontLit").title).toBe(
            "Acme",
        );
    });

    it("falls description back to the site subtitle", () => {
        expect(
            resolveSeo(
                { description: "Custom" },
                { subtitle: "Tagline" } as any,
                "FrontLit",
            ).description,
        ).toBe("Custom");
        expect(
            resolveSeo({}, { subtitle: "Tagline" } as any, "FrontLit")
                .description,
        ).toBe("Tagline");
    });

    it("falls the image back to the team logo", () => {
        const site = { logo: { url: "https://cdn/logo.png" } } as any;
        expect(
            resolveSeo(
                { image: { url: "https://cdn/page.png" } },
                site,
                "FrontLit",
            ).imageUrl,
        ).toBe("https://cdn/page.png");
        expect(resolveSeo({}, site, "FrontLit").imageUrl).toBe(
            "https://cdn/logo.png",
        );
        expect(resolveSeo({}, null, "FrontLit").imageUrl).toBeNull();
    });

    it("only disallows robots when explicitly false — null/undefined default to indexable", () => {
        expect(
            resolveSeo({ robotsAllowed: false }, null, "FrontLit").robotsIndex,
        ).toBe(false);
        expect(
            resolveSeo({ robotsAllowed: null }, null, "FrontLit").robotsIndex,
        ).toBe(true);
        expect(resolveSeo({}, null, "FrontLit").robotsIndex).toBe(true);
    });
});

describe("titleTemplate", () => {
    it("uses the site's branded title, falling back to the deployment name", () => {
        expect(titleTemplate({ title: "Acme" } as any, "FrontLit")).toBe(
            "Acme",
        );
        expect(titleTemplate(null, "FrontLit")).toBe("FrontLit");
    });
});
