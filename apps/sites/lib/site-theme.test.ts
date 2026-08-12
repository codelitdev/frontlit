import { describe, expect, it } from "vitest";
import { themes } from "@frontlit/page-builder/primitives";
import { siteThemeStyleTag } from "./site-theme";
import { resolveSiteTheme } from "./site-theme";

describe("resolveSiteTheme", () => {
    it("resolves a built-in team theme by its logical id", () => {
        expect(resolveSiteTheme("learning", null).id).toBe("learning");
    });

    it("uses a saved custom team theme style", () => {
        const style = {
            colors: {
                light: { primary: "#123456" },
                dark: { primary: "#abcdef" },
            },
        };

        expect(resolveSiteTheme("thm_custom", style)).toMatchObject({
            id: "thm_custom",
            name: "Custom",
            theme: style,
        });
    });

    it("falls back to Classic for a missing or unknown reference", () => {
        expect(resolveSiteTheme(null, null).id).toBe("classic");
        expect(resolveSiteTheme("unknown", null).id).toBe("classic");
    });
});

describe("siteThemeStyleTag", () => {
    it("emits complete CSS colors under the requested scope", () => {
        const css = siteThemeStyleTag(
            themes.find((theme) => theme.id === "midnight")!,
            '[data-theme-scope="chat"]',
        );

        expect(css).toContain('[data-theme-scope="chat"] {');
        expect(css).toContain("--primary: hsl(207 82% 66%);");
        expect(css).not.toContain(".pb-theme {");
    });
});
