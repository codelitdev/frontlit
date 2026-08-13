import type { TeamMembership, TeamPermission } from "./api";
import { isNavItemActive } from "./nav-active";

type RouteAccess = {
    href: string;
    permissions?: readonly TeamPermission[];
    ownerOnly?: boolean;
};

/**
 * Read access needed to open each team-scoped dashboard screen. Write
 * controls are enforced by their own operations; this map prevents a member
 * from seeing a screen whose initial data request they cannot make.
 */
const ROUTE_ACCESS: readonly RouteAccess[] = [
    { href: "/website/code-injection", ownerOnly: true },
    { href: "/website/pages", permissions: ["pages:read"] },
    { href: "/website/branding", permissions: ["settings:read"] },
    { href: "/website/domain", permissions: ["domains:read"] },
    { href: "/website/chatbot", permissions: ["chatbot:read"] },
    { href: "/newsletter", permissions: ["settings:read", "broadcasts:read"] },
    { href: "/changelog", permissions: ["changelogs:read"] },
    { href: "/settings/members", permissions: ["members:read"] },
    { href: "/settings/esp", permissions: ["esp:read"] },
    { href: "/settings/ai", permissions: ["ai:read"] },
    { href: "/media", permissions: ["media:read"] },
    { href: "/users", permissions: ["contacts:read"] },
    { href: "/blog", permissions: ["blogs:read"] },
    { href: "/docs", permissions: ["docs:read"] },
    { href: "/support", permissions: ["helpdesk:read"] },
    { href: "/", permissions: ["helpdesk:read"] },
];

/** Prefer the first visible product area in sidebar order for a member's
 * landing route. `/` is excluded because Inbox is not a safe default for
 * every membership. */
const WORKSPACE_LANDING_PATHS = [
    "/website/pages",
    "/website/branding",
    "/website/domain",
    "/website/chatbot",
    "/blog",
    "/docs",
    "/newsletter",
    "/changelog",
    "/users",
    "/media",
    "/settings/members",
    "/settings/esp",
    "/settings/ai",
] as const;

function accessForPath(pathname: string): RouteAccess | undefined {
    return ROUTE_ACCESS.find((access) =>
        isNavItemActive(pathname, access.href),
    );
}

export function isTeamScopedWorkspacePath(pathname: string): boolean {
    return accessForPath(pathname) !== undefined;
}

export function canAccessWorkspacePath(
    pathname: string,
    team: TeamMembership | null,
): boolean {
    const access = accessForPath(pathname);
    if (!access) return true;
    if (!team) return false;
    if (team.isOwner) return true;
    if (access.ownerOnly) return false;
    return (access.permissions ?? []).every((permission) =>
        team.effectivePermissions.includes(permission),
    );
}

export function getWorkspaceLandingPath(
    team: TeamMembership | null,
): string | null {
    return (
        WORKSPACE_LANDING_PATHS.find((pathname) =>
            canAccessWorkspacePath(pathname, team),
        ) ?? null
    );
}
