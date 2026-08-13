import { describe, expect, it } from "vitest";
import {
    expandPermissionPreset,
    filterDelegablePermissions,
    isImpliedBySelection,
    summarizePermissions,
} from "./permission-ui";

describe("permission presets and delegation filter", () => {
    it("expands presets to permission arrays without treating names as authority", () => {
        const marketing = expandPermissionPreset("marketing");
        expect(marketing).toContain("broadcasts:write");
        expect(marketing).not.toContain("broadcasts:send");
        expect(expandPermissionPreset("support")).toEqual([
            "docs:read",
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
