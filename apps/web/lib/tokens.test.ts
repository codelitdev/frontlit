import { describe, expect, it } from "vitest";
import {
  isStaleTeamSelectionError,
  needsTeamSelection,
  resolveCurrentTeamId,
} from "./tokens";

describe("needsTeamSelection", () => {
  it("is true for explicit missing-team selection errors", () => {
    expect(needsTeamSelection(409, "no_team")).toBe(true);
    expect(needsTeamSelection(409, "team_required")).toBe(true);
  });

  it("does not reinterpret unrelated 409 conflicts as team selection", () => {
    expect(
      needsTeamSelection(
        409,
        "Configure the email delivery connection in Settings first",
      ),
    ).toBe(false);
    expect(needsTeamSelection(409, "duplicate_slug")).toBe(false);
    expect(needsTeamSelection(409)).toBe(false);
  });

  it("is true for a 400 invalid_team_id", () => {
    expect(needsTeamSelection(400, "invalid_team_id")).toBe(true);
  });

  it("is true for a 403 not_a_team_member", () => {
    expect(needsTeamSelection(403, "not_a_team_member")).toBe(true);
  });

  it("is false for unrelated errors", () => {
    expect(needsTeamSelection(404, "not_found")).toBe(false);
    expect(needsTeamSelection(400, "validation_error")).toBe(false);
  });
});

describe("isStaleTeamSelectionError", () => {
  it("flags invalid_team_id and not_a_team_member as stale", () => {
    expect(isStaleTeamSelectionError("invalid_team_id")).toBe(true);
    expect(isStaleTeamSelectionError("not_a_team_member")).toBe(true);
  });

  it("does not flag a plain missing-selection case", () => {
    expect(isStaleTeamSelectionError(undefined)).toBe(false);
  });
});

describe("resolveCurrentTeamId", () => {
  it("returns the sole team when there is exactly one", () => {
    expect(resolveCurrentTeamId([{ teamId: "team_a" }])).toBe("team_a");
  });

  it("returns null when there are several teams and no cookie", () => {
    expect(
      resolveCurrentTeamId([{ teamId: "team_a" }, { teamId: "team_b" }]),
    ).toBeNull();
  });

  it("returns null when the account has no teams", () => {
    expect(resolveCurrentTeamId([])).toBeNull();
  });
});
