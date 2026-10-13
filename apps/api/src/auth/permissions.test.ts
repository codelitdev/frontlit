import { describe, expect, it } from "vitest";
import {
  TEAM_PERMISSIONS,
  computeEffectivePermissions,
  evaluateInvitationDelegation,
  evaluateMembershipEdit,
  evaluateMembershipRemove,
  hasEffectivePermission,
  normalizePermissionGrants,
  UnknownPermissionError,
} from "@frontlit/api-contract";

describe("team permission catalog", () => {
  it("gives an owner every catalog permission with empty stored grants", () => {
    const effective = computeEffectivePermissions([], { isOwner: true });
    expect(effective).toEqual([...TEAM_PERMISSIONS]);
    expect(hasEffectivePermission([], "pages:read", { isOwner: true })).toBe(true);
    expect(hasEffectivePermission([], "broadcasts:send", { isOwner: true })).toBe(true);
  });

  it("closes write to read and does not grant unrelated writes", () => {
    const effective = computeEffectivePermissions(["pages:write"]);
    expect(effective).toEqual(["pages:read", "pages:write"]);
    expect(hasEffectivePermission(["pages:write"], "pages:read")).toBe(true);
    expect(hasEffectivePermission(["pages:write"], "themes:write")).toBe(false);
    expect(hasEffectivePermission(["pages:write"], "broadcasts:send")).toBe(false);
  });

  it("DM-AUTH/V24: documentation write, publish, and manage do not imply each other", () => {
    expect(computeEffectivePermissions(["documentation:write"])).toEqual([
      "documentation:read",
      "documentation:write",
    ]);
    expect(computeEffectivePermissions(["documentation:publish"])).toEqual([
      "documentation:read",
      "documentation:publish",
    ]);
    expect(computeEffectivePermissions(["documentation:manage"])).toEqual([
      "documentation:read",
      "documentation:manage",
    ]);
  });

  it("closes send and member administration implications", () => {
    expect(computeEffectivePermissions(["broadcasts:send"])).toEqual([
      "broadcasts:read",
      "broadcasts:write",
      "broadcasts:send",
    ]);
    expect(computeEffectivePermissions(["members:invite"])).toEqual([
      "members:read",
      "members:invite",
    ]);
    expect(computeEffectivePermissions(["members:manage"])).toEqual([
      "members:read",
      "members:manage",
    ]);
  });

  it("rejects unknown identifiers and stores grants in catalog order", () => {
    expect(() => normalizePermissionGrants(["pages:write", "nope"])).toThrow(
      UnknownPermissionError,
    );
    expect(
      normalizePermissionGrants(["pages:write", "pages:read", "pages:write"]),
    ).toEqual(["pages:read", "pages:write"]);
  });

  it("blocks non-escalation, self-edit, and owner-edit", () => {
    const manager = computeEffectivePermissions(["members:manage", "pages:write"]);
    const broader = computeEffectivePermissions(["pages:write", "ai:write"]);
    expect(
      evaluateMembershipEdit({
        actorAccountId: "mgr",
        actorIsOwner: false,
        actorEffective: manager,
        targetAccountId: "peer",
        targetIsOwner: false,
        currentEffective: broader,
        proposedEffective: manager,
      }).allowed,
    ).toBe(false);
    expect(
      evaluateInvitationDelegation({
        actorIsOwner: false,
        actorEffective: manager,
        proposedEffective: broader,
      }).allowed,
    ).toBe(false);
    expect(
      evaluateMembershipEdit({
        actorAccountId: "mgr",
        actorIsOwner: false,
        actorEffective: manager,
        targetAccountId: "mgr",
        targetIsOwner: false,
        currentEffective: manager,
        proposedEffective: manager,
      }),
    ).toMatchObject({ allowed: false, reason: "self_edit" });
    expect(
      evaluateMembershipEdit({
        actorAccountId: "mgr",
        actorIsOwner: false,
        actorEffective: manager,
        targetAccountId: "owner",
        targetIsOwner: true,
        currentEffective: [...TEAM_PERMISSIONS],
        proposedEffective: manager,
      }),
    ).toMatchObject({ allowed: false, reason: "owner_target" });
    expect(
      evaluateMembershipRemove({
        actorAccountId: "mgr",
        actorIsOwner: false,
        actorEffective: manager,
        targetAccountId: "owner",
        targetIsOwner: true,
        targetEffective: [...TEAM_PERMISSIONS],
      }),
    ).toMatchObject({ allowed: false, reason: "owner_target" });
  });
});
