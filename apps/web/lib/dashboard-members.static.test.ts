import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");

function read(rel: string) {
  return readFileSync(path.join(root, rel), "utf8");
}

describe("dashboard members and invitation sources", () => {
  it("keeps the invitation secret in the fragment and submits it in the body", () => {
    const page = read("app/team-invitations/[invitationId]/page.tsx");
    const layout = read("app/team-invitations/[invitationId]/layout.tsx");
    expect(layout).toContain("no-referrer");
    expect(page).toContain("readInvitationTokenFromHash");
    expect(page).toContain("peekInvitationToken");
    expect(page).toContain("clearInvitationToken");
    expect(page).toContain("acceptTeamInvitation");
    expect(page).toContain("membership.teamId");
    expect(page).toContain('form.action = "/api/team/switch"');
    expect(page).toContain("rejectTeamInvitation");
    expect(page).toContain("clearInvitationHash");
    expect(page).toContain("clientLoginPath");
    expect(page).not.toMatch(/searchParams.*token/);
  });

  it("renders an Owner indicator and treats presets as UI-only", () => {
    const members = read("app/(workspace)/settings/members/page.tsx");
    const picker = read("components/workspace/permission-picker.tsx");
    expect(members).toContain("Owner");
    expect(members).toContain("Leave team");
    expect(members).toContain("confirmLabel");
    expect(members).toContain("Send invitation");
    expect(members).toContain("max-h-[min(90vh,40rem)]");
    expect(members).toContain("You don't have permission to view this team's members.");
    expect(members).toContain("createTeamInvitation");
    expect(picker).toContain("PERMISSION_PRESET_IDS");
    expect(picker).toContain("implied");
    expect(members).not.toMatch(/body:\s*\{\s*preset/);
    expect(members).toContain("RecentAuthDialog");
    expect(members).toContain("isRecentAuthRequired");
  });

  it("offers an email-OTP step-up on ownership transfer and team deletion", () => {
    const members = read("app/(workspace)/settings/members/page.tsx");
    const teams = read("app/(workspace)/teams/page.tsx");
    const dialog = read("components/workspace/recent-auth-dialog.tsx");
    const reverify = read("lib/session-reverify.ts");
    expect(dialog).toContain("sendEmailOtp");
    expect(dialog).toContain("reverifySession");
    expect(reverify).toContain("/api/auth/email-otp/send-verification-otp");
    expect(reverify).toContain("/api/proxy/session/reverify");
    expect(members).toContain("transferTeamOwnership");
    expect(teams).toContain("onRecentAuthRequired");
    expect(teams).toContain("deleteTeam");
  });

  it("only renders account controls the listed membership can use", () => {
    const teams = read("app/(workspace)/teams/page.tsx");
    expect(teams).toContain("Create or join a team");
    expect(teams).toContain("Already invited?");
    expect(teams).toContain('team.effectivePermissions.includes("team:update")');
    expect(teams).toContain("{canUpdate ? (");
    expect(teams).toContain("{team.isOwner && (");
    expect(teams).toContain("{canManageKeys && (");
    expect(teams).toContain("Could not rename team");
    expect(teams).toContain("Could not create API key");
    expect(teams).toContain("Could not revoke API key");
  });

  it("shares one permission-aware navigation and route gate", () => {
    const layout = read("app/(workspace)/layout.tsx");
    const sidebar = read("components/workspace/app-sidebar.tsx");
    expect(layout).toContain("WorkspaceAccessProvider");
    expect(layout).toContain("WorkspaceAccessGate");
    expect(sidebar).toContain("visibleNavItems");
    expect(sidebar).toContain("canAccessWorkspacePath");
    const switcher = read("components/workspace/team-switcher.tsx");
    expect(switcher).toContain("canAccessWorkspacePath");
    expect(switcher).toContain("getWorkspaceLandingPath");
    const editorLayout = read("app/editor/layout.tsx");
    const pageLibrary = read("app/(workspace)/website/pages/page.tsx");
    expect(editorLayout).toContain("EditorAccessGate");
    expect(pageLibrary).toContain('includes("pages:write")');
    expect(pageLibrary).toContain("PageSummary");
  });
});
