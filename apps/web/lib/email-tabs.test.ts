import { describe, expect, it } from "vitest";
import {
    DEFAULT_EMAIL_TAB,
    emailTabHref,
    isEmailTab,
    parseEmailTab,
} from "./email-tabs";

describe("email tabs", () => {
    it("uses stable query URLs", () => {
        expect(emailTabHref("broadcasts")).toBe("/email?tab=broadcasts");
        expect(emailTabHref("templates")).toBe("/email?tab=templates");
        expect(isEmailTab("templates")).toBe(true);
        expect(isEmailTab("drafts")).toBe(false);
    });

    it("falls back to broadcasts for missing or unknown tabs", () => {
        expect(parseEmailTab(undefined)).toBe(DEFAULT_EMAIL_TAB);
        expect(parseEmailTab("drafts")).toBe("broadcasts");
        expect(parseEmailTab(["templates"])).toBe("templates");
    });
});
