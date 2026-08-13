import { describe, expect, it } from "vitest";
import { isNavItemActive } from "./nav-active";
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
    });

    it("uses effective team permissions to gate workspace routes", () => {
        const readOnlyDocs = team(["docs:read"]);
        expect(canAccessWorkspacePath("/", readOnlyDocs)).toBe(false);
        expect(canAccessWorkspacePath("/docs", readOnlyDocs)).toBe(true);
        expect(canAccessWorkspacePath("/website/pages", readOnlyDocs)).toBe(
            false,
        );
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
        expect(getWorkspaceLandingPath(team(["docs:read"]))).toBe("/docs");
        expect(getWorkspaceLandingPath(team([]))).toBeNull();
    });
});
