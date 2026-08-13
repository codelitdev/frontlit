import { describe, expect, it } from "vitest";
import {
    PERMISSION_GROUPS,
    expandPermissionPreset,
    filterDelegablePermissions,
    isImpliedBySelection,
    summarizePermissions,
} from "./permission-ui";

describe("permission presets and delegation filter", () => {
    it("groups all typed content permissions under one Content heading", () => {
        const content = PERMISSION_GROUPS.find(
            (group) => group.id === "content",
        );
        expect(content).toEqual({
            id: "content",
            label: "Content",
            permissions: [
                "articles:read",
                "articles:write",
                "documentation:read",
                "documentation:write",
                "product-updates:read",
                "product-updates:write",
            ],
        });
        expect(
            PERMISSION_GROUPS.some((group) =>
                ["blog", "docs", "changelog"].includes(group.id),
            ),
        ).toBe(false);
    });

    it("expands presets to permission arrays without treating names as authority", () => {
        const marketing = expandPermissionPreset("marketing");
        expect(marketing).toContain("broadcasts:write");
        expect(marketing).not.toContain("broadcasts:send");
        expect(expandPermissionPreset("support")).toEqual([
            "documentation:read",
            "helpdesk:read",
            "helpdesk:write",
        ]);
    });

    it("filters selectable permissions to what the actor can delegate", () => {
        const actor = expandPermissionPreset("marketing");
        expect(filterDelegablePermissions(actor, false)).toEqual(actor);
        expect(filterDelegablePermissions(actor, true)).toContain(
            "members:manage",
        );
    });

    it("marks implied permissions without requiring them to be stored", () => {
        expect(isImpliedBySelection("pages:read", ["pages:write"])).toBe(true);
        expect(isImpliedBySelection("pages:write", ["pages:write"])).toBe(
            false,
        );
        expect(summarizePermissions(expandPermissionPreset("read_only"))).toBe(
            "Read-only",
        );
    });
});
