import { describe, expect, it } from "vitest";
import type { TeamMembership } from "./api";
import {
    firstAccessibleWebsiteTab,
    isWebsiteTab,
    websiteTabHref,
} from "./website-tabs";

function team(
    permissions: TeamMembership["effectivePermissions"],
): TeamMembership {
    return {
        teamId: "team_website",
        name: "Website team",
        isOwner: false,
        effectivePermissions: permissions,
    };
}

describe("website tabs", () => {
    it("uses stable, canonical query URLs", () => {
        expect(websiteTabHref("pages")).toBe("/website?tab=pages");
        expect(isWebsiteTab("code-injection")).toBe(true);
        expect(isWebsiteTab("unknown")).toBe(false);
    });

    it("chooses the first website tab the current member may read", () => {
        expect(firstAccessibleWebsiteTab(team(["domains:read"]))).toBe(
            "domain",
        );
        expect(firstAccessibleWebsiteTab(team(["chatbot:read"]))).toBe(
            "chatbot",
        );
        expect(firstAccessibleWebsiteTab(team([]))).toBeNull();
    });
});
