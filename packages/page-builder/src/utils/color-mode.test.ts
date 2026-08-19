import { describe, expect, it } from "vitest";
import { resolveColorMode, toggleColorMode } from "./color-mode";

describe("resolveColorMode", () => {
    it("returns the explicit mode unchanged", () => {
        expect(resolveColorMode("light", true)).toBe("light");
        expect(resolveColorMode("dark", false)).toBe("dark");
    });

    it("follows the OS preference when mode is system", () => {
        expect(resolveColorMode("system", true)).toBe("dark");
        expect(resolveColorMode("system", false)).toBe("light");
    });
});

describe("toggleColorMode", () => {
    it("flips the resolved palette", () => {
        expect(toggleColorMode("light")).toBe("dark");
        expect(toggleColorMode("dark")).toBe("light");
    });
});
