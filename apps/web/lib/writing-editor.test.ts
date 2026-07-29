import { describe, expect, it } from "vitest";
import { formatSavedAt, parseTags } from "./writing-editor";

describe("writing editor helpers", () => {
    it("normalizes comma-separated tags and removes duplicates", () => {
        expect(parseTags(" Product, launch, product,  engineering ")).toEqual([
            "Product",
            "launch",
            "engineering",
        ]);
    });

    it("describes recent save times without implying unsupported history", () => {
        const now = new Date("2026-07-29T12:00:00.000Z").getTime();

        expect(formatSavedAt("2026-07-29T11:59:55.000Z", now)).toBe("Saved just now");
        expect(formatSavedAt("2026-07-29T11:58:00.000Z", now)).toBe("Saved 2m ago");
        expect(formatSavedAt("2026-07-29T09:00:00.000Z", now)).toBe("Saved 3h ago");
    });
});
