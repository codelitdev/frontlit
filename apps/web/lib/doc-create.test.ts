import { describe, expect, it } from "vitest";
import { validateDocTitle } from "./doc-create";

describe("validateDocTitle", () => {
    it("returns a useful error for a whitespace-only title", () => {
        expect(validateDocTitle("   ")).toEqual({
            ok: false,
            error: "Enter a doc title.",
        });
    });

    it("trims a valid title before submission", () => {
        expect(validateDocTitle("  Getting started  ")).toEqual({
            ok: true,
            title: "Getting started",
        });
    });
});
