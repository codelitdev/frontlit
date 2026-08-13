import type { TeamMembership, TeamPermission } from "./api";
import { isNavItemActive } from "./nav-active";

type RouteAccess = {
    href: string;
    permissions?: readonly TeamPermission[];
    permissionMode?: "all" | "any";
    ownerOnly?: boolean;
};

type EditorRouteAccess = RouteAccess & {
    fallbackPath: string;
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
    {
        href: "/website",
        permissions: [
            "pages:read",
            "settings:read",
            "domains:read",
            "chatbot:read",
        ],
        permissionMode: "any",
    },
    { href: "/email", permissions: ["settings:read", "broadcasts:read"] },
    {
        href: "/content",
        permissions: [
            "articles:read",
            "documentation:read",
            "product-updates:read",
        ],
        permissionMode: "any",
    },
    { href: "/settings/members", permissions: ["members:read"] },
    { href: "/settings/esp", permissions: ["esp:read"] },
    { href: "/settings/ai", permissions: ["ai:read"] },
    { href: "/media", permissions: ["media:read"] },
    { href: "/contacts", permissions: ["contacts:read"] },
    { href: "/support", permissions: ["helpdesk:read"] },
    { href: "/", permissions: ["helpdesk:read"] },
];

/** Prefer the first visible product area in sidebar order for a member's
 * landing route. `/` is excluded because Inbox is not a safe default for
 * every membership. */
const WORKSPACE_LANDING_PATHS = [
    "/website?tab=pages",
    "/website?tab=branding",
    "/website?tab=domain",
    "/website?tab=chatbot",
    "/content",
    "/email?tab=broadcasts",
    "/contacts",
    "/media",
    "/settings/members",
    "/settings/esp",
    "/settings/ai",
] as const;

/** Editors are separate chrome-free routes, so they need their own explicit
 * access map rather than relying on sidebar visibility. Reading a library is
 * deliberately less privileged than opening its mutating editor. */
const EDITOR_ROUTE_ACCESS: readonly EditorRouteAccess[] = [
    {
        href: "/editor/content/articles",
        permissions: ["articles:write"],
        fallbackPath: "/content",
    },
    {
        href: "/editor/content/documentation",
        permissions: ["documentation:write"],
        fallbackPath: "/content",
    },
    {
        href: "/editor/content/product-updates",
        permissions: ["product-updates:write"],
        fallbackPath: "/content",
    },
    {
        href: "/editor/pages",
        permissions: ["pages:write"],
        fallbackPath: "/website?tab=pages",
    },
    {
        href: "/editor/email",
        permissions: ["broadcasts:write"],
        fallbackPath: "/email?tab=broadcasts",
    },
];

function accessForPath(pathname: string): RouteAccess | undefined {
    const normalizedPathname = pathname.split(/[?#]/, 1)[0] || "/";
    return ROUTE_ACCESS.find((access) =>
        isNavItemActive(normalizedPathname, access.href),
    );
}

function editorAccessForPath(pathname: string): EditorRouteAccess | undefined {
    const normalizedPathname = pathname.split(/[?#]/, 1)[0] || "/";
    return EDITOR_ROUTE_ACCESS.find((access) =>
        isNavItemActive(normalizedPathname, access.href),
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
    const checks = (access.permissions ?? []).map((permission) =>
        team.effectivePermissions.includes(permission),
    );
    return access.permissionMode === "any"
        ? checks.some(Boolean)
        : checks.every(Boolean);
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

export function canAccessEditorPath(
    pathname: string,
    team: TeamMembership | null,
): boolean {
    const access = editorAccessForPath(pathname);
    if (!access) return true;
    if (!team) return false;
    if (team.isOwner) return true;
    return (access.permissions ?? []).every((permission) =>
        team.effectivePermissions.includes(permission),
    );
}

export function getEditorFallbackPath(
    pathname: string,
    team: TeamMembership | null,
): string {
    const access = editorAccessForPath(pathname);
    if (
        access &&
        canAccessWorkspacePath(access.fallbackPath.split("?")[0], team)
    ) {
        return access.fallbackPath;
    }
    return getWorkspaceLandingPath(team) ?? "/teams";
}
