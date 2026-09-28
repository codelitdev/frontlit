import { BookOpen, History, Newspaper } from "lucide-react";
import type { TeamPermission } from "@/lib/api";

export const CONTENT_TYPES = ["articles", "documentation", "changelog"] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

export const CONTENT_TYPE_ALIASES: Record<string, ContentType> = {
  "product-updates": "changelog",
};

export const CONTENT_TYPE_NAV: Array<{
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
    CONTENT_TYPE_NAV.find((item) => item.type === type)!.permission,
  );
}

export function firstReadableContentType(
  permissions: readonly TeamPermission[],
  isOwner = false,
): ContentType | null {
  return (
    CONTENT_TYPE_NAV.find((item) => canReadContentType(item.type, permissions, isOwner))
      ?.type ?? null
  );
}
