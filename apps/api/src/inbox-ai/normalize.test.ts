import { describe, expect, it } from "vitest";
import {
    findMatchingPhrase,
    matchesNormalizedPhrase,
    normalizeInboxText,
} from "./normalize";

describe("inbox AI text matching", () => {
    it("normalizes unicode, case, and whitespace", () => {
        expect(normalizeInboxText("  Talk   TO\ta Person  ")).toBe(
            "talk to a person",
        );
    });

    it("matches phrases on token boundaries only", () => {
        expect(matchesNormalizedPhrase("this is illegal", "legal")).toBe(false);
        expect(matchesNormalizedPhrase("this is legal advice", "legal")).toBe(
            true,
        );
        expect(
            matchesNormalizedPhrase(
                "please talk to a person now",
                "talk to a person",
            ),
        ).toBe(true);
    });

    it("finds the first matching phrase", () => {
        expect(
            findMatchingPhrase("I want a refund please", ["cancel", "refund"]),
        ).toBe("refund");
        expect(findMatchingPhrase("hello there", ["agent", "human"])).toBe(
            null,
        );
    });
});
