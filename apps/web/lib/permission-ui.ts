import {
  computeEffectivePermissions,
  filterDelegablePermissions,
  HIGH_IMPACT_PERMISSIONS,
  PERMISSION_GROUPS,
  PERMISSION_PRESET_IDS,
  PERMISSION_PRESETS,
  expandPermissionPreset,
  type PermissionPresetId,
  type TeamPermission,
} from "@frontlit/api-contract";

export {
  filterDelegablePermissions,
  HIGH_IMPACT_PERMISSIONS,
  PERMISSION_GROUPS,
  PERMISSION_PRESET_IDS,
  expandPermissionPreset,
};

export const PRESET_LABELS: Record<PermissionPresetId, string> = {
  full_access: "Full access",
  content_manager: "Content manager",
  support: "Support",
  marketing: "Marketing",
  read_only: "Read-only",
  custom: "Custom",
};

export const PRESET_WARNINGS: Partial<Record<PermissionPresetId, string>> = {
  full_access:
    "Includes member administration, domain changes, AI credentials, and broadcast sending.",
};

export function summarizePermissions(permissions: readonly TeamPermission[]) {
  if (permissions.length === 0) return "No product access";
  for (const id of PERMISSION_PRESET_IDS) {
    if (id === "custom") continue;
    const preset = PERMISSION_PRESETS[id];
    if (
      preset.length === permissions.length &&
      preset.every((permission, index) => permission === permissions[index])
    ) {
      return PRESET_LABELS[id];
    }
  }
  return `${permissions.length} custom permissions`;
}

export function isImpliedBySelection(
  permission: TeamPermission,
  selected: readonly TeamPermission[],
): boolean {
  if (selected.includes(permission)) return false;
  const closed = computeEffectivePermissions(selected);
  return closed.includes(permission) && !selected.includes(permission);
}
