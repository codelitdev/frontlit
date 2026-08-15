import { describe, expect, it } from "vitest";
import { isNavHrefActive, isNavItemActive } from "./nav-active";
import {
    canAccessWorkspacePath,
    getWorkspaceLandingPath,
} from "./workspace-access";
import type { TeamMembership } from "./api";

function team(
    permissions: TeamMembership["effectivePermissions"],
): TeamMembership {
    return {
        teamId: "team_test",
        name: "Test team",
        ownerAccountId: "account_owner",
        isOwner: false,
        effectivePermissions: permissions,
    };
}

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
        expect(isNavItemActive("/website", "/website?tab=pages")).toBe(true);
    });

    it("distinguishes query-tab submenu items", () => {
        expect(
            isNavHrefActive(
                "/content",
                "/content?type=articles",
                "type=articles",
            ),
        ).toBe(true);
        expect(
            isNavHrefActive(
                "/content",
                "/content?type=articles",
                "type=documentation",
            ),
        ).toBe(false);
        expect(
            isNavHrefActive("/website", "/website?tab=pages", "tab=pages"),
        ).toBe(true);
        expect(
            isNavHrefActive("/website", "/website?tab=pages", "tab=branding"),
        ).toBe(false);
        expect(isNavHrefActive("/settings/members", "/settings/members")).toBe(
            true,
        );
    });

    it("uses effective team permissions to gate workspace routes", () => {
        const readOnlyDocs = team(["documentation:read"]);
        expect(canAccessWorkspacePath("/", readOnlyDocs)).toBe(false);
        expect(canAccessWorkspacePath("/content", readOnlyDocs)).toBe(true);
        expect(canAccessWorkspacePath("/website/pages", readOnlyDocs)).toBe(
            false,
        );
        expect(canAccessWorkspacePath("/website?tab=pages", readOnlyDocs)).toBe(
            false,
        );
        expect(
            canAccessWorkspacePath("/content?type=articles", readOnlyDocs),
        ).toBe(false);
        expect(
            canAccessWorkspacePath("/content?type=documentation", readOnlyDocs),
        ).toBe(true);
        expect(
            canAccessWorkspacePath("/website/code-injection", readOnlyDocs),
        ).toBe(false);
    });

    it("keeps owner-only workspace routes hidden from non-owner updaters", () => {
        const updater = team(["team:update", "settings:read"]);
        expect(canAccessWorkspacePath("/teams", updater)).toBe(true);
        expect(canAccessWorkspacePath("/website/branding", updater)).toBe(true);
        expect(canAccessWorkspacePath("/website/code-injection", updater)).toBe(
            false,
        );
    });

    it("chooses the first permitted workspace route as a safe landing page", () => {
        expect(getWorkspaceLandingPath(team(["documentation:read"]))).toBe(
            "/content",
        );
        expect(getWorkspaceLandingPath(team(["chatbot:read"]))).toBe(
            "/website?tab=chatbot",
        );
        expect(getWorkspaceLandingPath(team([]))).toBeNull();
    });
});
