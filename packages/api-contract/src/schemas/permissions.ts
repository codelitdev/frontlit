import { z } from "zod";

/**
 * Human team-permission catalog. Identifiers are stable API data.
 * Implication, validation, and delegation checks live here so the API and
 * dashboard share one implementation. This is not an OAuth scope catalog.
 */
export const TEAM_PERMISSIONS = [
    "team:update",
    "members:read",
    "members:invite",
    "members:manage",
    "pages:read",
    "pages:write",
    "themes:read",
    "themes:write",
    "media:read",
    "media:write",
    "blogs:read",
    "blogs:write",
    "docs:read",
    "docs:write",
    "changelogs:read",
    "changelogs:write",
    "contacts:read",
    "contacts:write",
    "segments:read",
    "segments:write",
    "broadcasts:read",
    "broadcasts:write",
    "broadcasts:send",
    "esp:read",
    "esp:write",
    "chatbot:read",
    "chatbot:write",
    "helpdesk:read",
    "helpdesk:write",
    "domains:read",
    "domains:write",
    "ai:read",
    "ai:write",
    "settings:read",
    "settings:write",
] as const;

export type TeamPermission = (typeof TEAM_PERMISSIONS)[number];

export const teamPermissionSchema = z.enum(TEAM_PERMISSIONS);

export const TEAM_PERMISSION_SET = new Set<string>(TEAM_PERMISSIONS);

export function isTeamPermission(value: unknown): value is TeamPermission {
    return typeof value === "string" && TEAM_PERMISSION_SET.has(value);
}

/** Write implies the matching read; send implies write; invite/manage imply read. */
export const PERMISSION_IMPLICATIONS: Readonly<
    Partial<Record<TeamPermission, readonly TeamPermission[]>>
> = {
    "pages:write": ["pages:read"],
    "themes:write": ["themes:read"],
    "media:write": ["media:read"],
    "blogs:write": ["blogs:read"],
    "docs:write": ["docs:read"],
    "changelogs:write": ["changelogs:read"],
    "contacts:write": ["contacts:read"],
    "segments:write": ["segments:read"],
    "broadcasts:write": ["broadcasts:read"],
    "broadcasts:send": ["broadcasts:write"],
    "esp:write": ["esp:read"],
    "chatbot:write": ["chatbot:read"],
    "helpdesk:write": ["helpdesk:read"],
    "domains:write": ["domains:read"],
    "ai:write": ["ai:read"],
    "settings:write": ["settings:read"],
    "members:invite": ["members:read"],
    "members:manage": ["members:read"],
};

export class UnknownPermissionError extends Error {
    readonly permissions: string[];

    constructor(permissions: string[]) {
        super(`Unknown team permission(s): ${permissions.join(", ")}`);
        this.name = "UnknownPermissionError";
        this.permissions = permissions;
    }
}

/** Reject unknown identifiers. Dedupe and store in catalog order. */
export function normalizePermissionGrants(
    grants: readonly string[],
): TeamPermission[] {
    const unknown = grants.filter((grant) => !isTeamPermission(grant));
    if (unknown.length > 0) {
        throw new UnknownPermissionError([...new Set(unknown)]);
    }
    const selected = new Set(grants as TeamPermission[]);
    return TEAM_PERMISSIONS.filter((permission) => selected.has(permission));
}

export function computeEffectivePermissions(
    grants: readonly string[],
    options: { isOwner?: boolean } = {},
): TeamPermission[] {
    if (options.isOwner) {
        return [...TEAM_PERMISSIONS];
    }
    const known = grants.filter(isTeamPermission);
    const effective = new Set<TeamPermission>(known);
    const queue = [...known];
    while (queue.length > 0) {
        const current = queue.pop()!;
        for (const implied of PERMISSION_IMPLICATIONS[current] ?? []) {
            if (!effective.has(implied)) {
                effective.add(implied);
                queue.push(implied);
            }
        }
    }
    return TEAM_PERMISSIONS.filter((permission) => effective.has(permission));
}

export function permissionSetEquals(
    left: readonly TeamPermission[],
    right: readonly TeamPermission[],
): boolean {
    if (left.length !== right.length) return false;
    return left.every((permission, index) => permission === right[index]);
}

export function isEffectiveSubset(
    inner: readonly TeamPermission[],
    outer: readonly TeamPermission[],
): boolean {
    const allowed = new Set(outer);
    return inner.every((permission) => allowed.has(permission));
}

export function hasEffectivePermission(
    grants: readonly string[],
    permission: TeamPermission,
    options: { isOwner?: boolean } = {},
): boolean {
    return computeEffectivePermissions(grants, options).includes(permission);
}

export type MembershipDelegationDecision =
    | { allowed: true }
    | {
          allowed: false;
          reason:
              | "self_edit"
              | "owner_target"
              | "not_subset"
              | "missing_manage"
              | "missing_invite";
      };

export function evaluateMembershipEdit(input: {
    actorAccountId: string;
    actorIsOwner: boolean;
    actorEffective: readonly TeamPermission[];
    targetAccountId: string;
    targetIsOwner: boolean;
    currentEffective: readonly TeamPermission[];
    proposedEffective: readonly TeamPermission[];
}): MembershipDelegationDecision {
    if (input.targetIsOwner) return { allowed: false, reason: "owner_target" };
    if (input.actorAccountId === input.targetAccountId) {
        return { allowed: false, reason: "self_edit" };
    }
    if (input.actorIsOwner) return { allowed: true };
    if (!input.actorEffective.includes("members:manage")) {
        return { allowed: false, reason: "missing_manage" };
    }
    if (
        !isEffectiveSubset(input.currentEffective, input.actorEffective) ||
        !isEffectiveSubset(input.proposedEffective, input.actorEffective)
    ) {
        return { allowed: false, reason: "not_subset" };
    }
    return { allowed: true };
}

export function evaluateMembershipRemove(input: {
    actorAccountId: string;
    actorIsOwner: boolean;
    actorEffective: readonly TeamPermission[];
    targetAccountId: string;
    targetIsOwner: boolean;
    targetEffective: readonly TeamPermission[];
}): MembershipDelegationDecision {
    if (input.targetIsOwner) return { allowed: false, reason: "owner_target" };
    if (input.actorAccountId === input.targetAccountId) {
        return { allowed: true };
    }
    if (input.actorIsOwner) return { allowed: true };
    if (!input.actorEffective.includes("members:manage")) {
        return { allowed: false, reason: "missing_manage" };
    }
    if (!isEffectiveSubset(input.targetEffective, input.actorEffective)) {
        return { allowed: false, reason: "not_subset" };
    }
    return { allowed: true };
}

export function evaluateInvitationDelegation(input: {
    actorIsOwner: boolean;
    actorEffective: readonly TeamPermission[];
    proposedEffective: readonly TeamPermission[];
}): MembershipDelegationDecision {
    if (input.actorIsOwner) return { allowed: true };
    if (
        !input.actorEffective.includes("members:invite") &&
        !input.actorEffective.includes("members:manage")
    ) {
        return { allowed: false, reason: "missing_invite" };
    }
    if (!isEffectiveSubset(input.proposedEffective, input.actorEffective)) {
        return { allowed: false, reason: "not_subset" };
    }
    return { allowed: true };
}

/** Every catalog permission is grantable to a non-owner. API-key management
 * is intentionally not a catalog permission — keys stay owner-only. */
export const GRANTABLE_NON_OWNER_PERMISSIONS: readonly TeamPermission[] =
    TEAM_PERMISSIONS;

export const PERMISSION_PRESET_IDS = [
    "full_access",
    "content_manager",
    "support",
    "marketing",
    "read_only",
    "custom",
] as const;

export type PermissionPresetId = (typeof PERMISSION_PRESET_IDS)[number];

const PRODUCT_READ_PERMISSIONS = TEAM_PERMISSIONS.filter(
    (permission) =>
        permission.endsWith(":read") && !permission.startsWith("members:"),
);

export const PERMISSION_PRESETS: Record<
    Exclude<PermissionPresetId, "custom">,
    readonly TeamPermission[]
> = {
    full_access: GRANTABLE_NON_OWNER_PERMISSIONS,
    content_manager: [
        "pages:read",
        "pages:write",
        "themes:read",
        "themes:write",
        "media:read",
        "media:write",
        "blogs:read",
        "blogs:write",
        "docs:read",
        "docs:write",
        "changelogs:read",
        "changelogs:write",
    ],
    support: ["helpdesk:read", "helpdesk:write", "docs:read"],
    marketing: [
        "contacts:read",
        "contacts:write",
        "segments:read",
        "segments:write",
        "broadcasts:read",
        "broadcasts:write",
    ],
    read_only: PRODUCT_READ_PERMISSIONS,
};

export const HIGH_IMPACT_PERMISSIONS = [
    "members:manage",
    "domains:write",
    "ai:write",
    "settings:write",
    "broadcasts:send",
] as const satisfies readonly TeamPermission[];

export function expandPermissionPreset(
    presetId: PermissionPresetId,
    custom: readonly string[] = [],
): TeamPermission[] {
    if (presetId === "custom") {
        return normalizePermissionGrants(custom);
    }
    return normalizePermissionGrants([...PERMISSION_PRESETS[presetId]]);
}

export function filterDelegablePermissions(
    actorEffective: readonly TeamPermission[],
    actorIsOwner: boolean,
): TeamPermission[] {
    if (actorIsOwner) return [...GRANTABLE_NON_OWNER_PERMISSIONS];
    const allowed = new Set(actorEffective);
    return GRANTABLE_NON_OWNER_PERMISSIONS.filter((permission) =>
        allowed.has(permission),
    );
}

export const PERMISSION_GROUPS: ReadonlyArray<{
    id: string;
    label: string;
    permissions: readonly TeamPermission[];
}> = [
    { id: "team", label: "Team", permissions: ["team:update"] },
    {
        id: "members",
        label: "Members",
        permissions: ["members:read", "members:invite", "members:manage"],
    },
    { id: "pages", label: "Pages", permissions: ["pages:read", "pages:write"] },
    {
        id: "themes",
        label: "Themes",
        permissions: ["themes:read", "themes:write"],
    },
    { id: "media", label: "Media", permissions: ["media:read", "media:write"] },
    { id: "blogs", label: "Blog", permissions: ["blogs:read", "blogs:write"] },
    {
        id: "docs",
        label: "Help docs",
        permissions: ["docs:read", "docs:write"],
    },
    {
        id: "changelogs",
        label: "Changelog",
        permissions: ["changelogs:read", "changelogs:write"],
    },
    {
        id: "contacts",
        label: "Contacts",
        permissions: ["contacts:read", "contacts:write"],
    },
    {
        id: "segments",
        label: "Segments",
        permissions: ["segments:read", "segments:write"],
    },
    {
        id: "broadcasts",
        label: "Broadcasts",
        permissions: ["broadcasts:read", "broadcasts:write", "broadcasts:send"],
    },
    { id: "esp", label: "ESP", permissions: ["esp:read", "esp:write"] },
    {
        id: "chatbot",
        label: "Chatbot",
        permissions: ["chatbot:read", "chatbot:write"],
    },
    {
        id: "helpdesk",
        label: "Help desk",
        permissions: ["helpdesk:read", "helpdesk:write"],
    },
    {
        id: "domains",
        label: "Domains",
        permissions: ["domains:read", "domains:write"],
    },
    { id: "ai", label: "AI", permissions: ["ai:read", "ai:write"] },
    {
        id: "settings",
        label: "Settings",
        permissions: ["settings:read", "settings:write"],
    },
];
