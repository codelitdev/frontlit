"use client";

import { BookOpen, History, Newspaper } from "lucide-react";
import type { TeamPermission } from "@/lib/api";
import { useWorkspaceAccess } from "@/components/workspace/workspace-access";
import { WorkspaceSectionTabs } from "@/components/workspace/workspace-section-tabs";

export const CONTENT_TYPES = [
    "articles",
    "documentation",
    "changelog",
] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

export const CONTENT_TYPE_ALIASES: Record<string, ContentType> = {
    "product-updates": "changelog",
};

const ITEMS: Array<{
    type: ContentType;
    label: string;
    permission: TeamPermission;
    icon: typeof Newspaper;
}> = [
    {
        type: "articles",
        label: "Articles",
        permission: "articles:read",
        icon: Newspaper,
    },
    {
        type: "documentation",
        label: "Documentation",
        permission: "documentation:read",
        icon: BookOpen,
    },
    {
        type: "changelog",
        label: "Changelog",
        permission: "product-updates:read",
        icon: History,
    },
];

export function canReadContentType(
    type: ContentType,
    permissions: readonly TeamPermission[],
    isOwner = false,
) {
    if (isOwner) return true;
    return permissions.includes(
        ITEMS.find((item) => item.type === type)!.permission,
    );
}

export function firstReadableContentType(
    permissions: readonly TeamPermission[],
    isOwner = false,
): ContentType | null {
    return (
        ITEMS.find((item) =>
            canReadContentType(item.type, permissions, isOwner),
        )?.type ?? null
    );
}

export function ContentTypeNav({ activeType }: { activeType: ContentType }) {
    const { currentTeam } = useWorkspaceAccess();
    const visibleItems = ITEMS.filter((item) =>
        canReadContentType(
            item.type,
            currentTeam?.effectivePermissions ?? [],
            currentTeam?.isOwner,
        ),
    );

    return (
        <WorkspaceSectionTabs
            ariaLabel="Content type"
            currentId={activeType}
            items={visibleItems.map((item) => ({
                id: item.type,
                label: item.label,
                href: `/content?type=${item.type}`,
                icon: item.icon,
            }))}
        />
    );
}
