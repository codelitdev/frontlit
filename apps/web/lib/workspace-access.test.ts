import { describe, expect, it } from "vitest";
import type { TeamMembership } from "./api";
import { canAccessEditorPath, getEditorFallbackPath } from "./workspace-access";

function team(permissions: TeamMembership["effectivePermissions"]): TeamMembership {
  return {
    teamId: "team_1",
    name: "Test team",
    isOwner: false,
    effectivePermissions: permissions,
  };
}

describe("editor workspace access", () => {
  it("keeps page libraries readable without exposing the page editor", () => {
    const viewer = team(["pages:read"]);

    expect(canAccessEditorPath("/editor/pages/pg_1", viewer)).toBe(false);
    expect(getEditorFallbackPath("/editor/pages/pg_1", viewer)).toBe(
      "/website?tab=pages",
    );
  });

  it("allows content editors into their matching editor", () => {
    const editor = team(["pages:read", "pages:write"]);

    expect(canAccessEditorPath("/editor/pages/pg_1", editor)).toBe(true);
  });

  it("uses a safe landing path when the viewer cannot read the library", () => {
    const viewer = team(["articles:read"]);

    expect(getEditorFallbackPath("/editor/pages/pg_1", viewer)).toBe("/content");
  });

  it("gates unified content editors by their content type", () => {
    const docsEditor = team(["documentation:read", "documentation:write"]);

    expect(canAccessEditorPath("/editor/content/documentation/doc_1", docsEditor)).toBe(
      true,
    );
    expect(canAccessEditorPath("/editor/content/articles/doc_1", docsEditor)).toBe(
      false,
    );
    expect(getEditorFallbackPath("/editor/content/articles/doc_1", docsEditor)).toBe(
      "/content",
    );
  });
});
