import { describe, expect, it } from "vitest";
import { isNavItemActive } from "./nav-active";

describe("isNavItemActive", () => {
    it("matches the inbox only on the exact root path", () => {
        expect(isNavItemActive("/", "/")).toBe(true);
        expect(isNavItemActive("/website/pages", "/")).toBe(false);
        expect(isNavItemActive("/website/chatbot", "/")).toBe(false);
    });

    it("matches nested routes for non-root items", () => {
        expect(isNavItemActive("/blog", "/blog")).toBe(true);
        expect(isNavItemActive("/blog/post", "/blog")).toBe(true);
        expect(isNavItemActive("/blogs", "/blog")).toBe(false);
        expect(isNavItemActive("/website/chatbot", "/website")).toBe(true);
        expect(isNavItemActive("/website/pages", "/website/pages")).toBe(true);
    });
});
