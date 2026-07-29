import { describe, expect, it } from "vitest";
import { resolvePageTheme } from "./page-theme";

describe("resolvePageTheme", () => {
    it("resolves a built-in theme by its logical id", () => {
        const theme = resolvePageTheme("learning", null);

        expect(theme?.id).toBe("learning");
        expect(theme?.theme.colors.light.primary).toBe("#2563eb");
    });

    it("uses a saved custom theme style when the API provides one", () => {
        const style = {
            colors: {
                light: { primary: "#123456" },
                dark: { primary: "#abcdef" },
            },
        };

        const theme = resolvePageTheme("thm_custom", style);

        expect(theme).toMatchObject({
            id: "thm_custom",
            name: "Custom",
            theme: style,
        });
    });

    it("returns null for a missing or unknown theme so the renderer can use Classic", () => {
        expect(resolvePageTheme(null, null)).toBeNull();
        expect(resolvePageTheme("unknown", null)).toBeNull();
    });
});
