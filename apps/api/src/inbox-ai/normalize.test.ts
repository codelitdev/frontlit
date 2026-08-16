import { describe, expect, it } from "vitest";
import {
    botOfferedHuman,
    findMatchingPhrase,
    isGreetingOnly,
    matchesNormalizedPhrase,
    normalizeInboxText,
    visitorConfirmedHuman,
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

    it("treats short greetings as not-unsure support questions", () => {
        expect(isGreetingOnly("Hi")).toBe(true);
        expect(isGreetingOnly("hi!")).toBe(true);
        expect(isGreetingOnly("How do refunds work?")).toBe(false);
        expect(isGreetingOnly("Hi I need a refund")).toBe(false);
    });

    it("escalates only after an explicit human request or a yes to an offer", () => {
        const extract = (content: unknown) => String(content);
        expect(visitorConfirmedHuman("How do refunds work?", [], extract)).toBe(
            false,
        );
        expect(visitorConfirmedHuman("yes", [], extract)).toBe(false);
        expect(
            visitorConfirmedHuman("I want to talk to a person", [], extract),
        ).toBe(true);
        expect(
            visitorConfirmedHuman(
                "yes please",
                [
                    {
                        author: "bot",
                        content: "Want me to connect you to a teammate?",
                    },
                ],
                extract,
            ),
        ).toBe(true);
        expect(botOfferedHuman("Want me to connect you to a teammate?")).toBe(
            true,
        );
        expect(
            visitorConfirmedHuman(
                "connect",
                [
                    {
                        author: "bot",
                        content:
                            "Would you like to be connected to a teammate?",
                    },
                ],
                extract,
            ),
        ).toBe(true);
        expect(visitorConfirmedHuman("connect", [], extract)).toBe(false);
    });
});
