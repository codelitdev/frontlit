"use client";

import { useId, useMemo } from "react";
import {
  HIGH_IMPACT_PERMISSIONS,
  PERMISSION_GROUPS,
  PERMISSION_PRESET_IDS,
  expandPermissionPreset,
  type PermissionPresetId,
  type TeamPermission,
} from "@frontlit/api-contract";
import { Checkbox } from "@/components/ui/codelit/checkbox";
import { Label } from "@/components/ui/codelit/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/codelit/select";
import { Banner } from "@/components/workspace/banner";
import {
  PRESET_LABELS,
  PRESET_WARNINGS,
  isImpliedBySelection,
} from "@/lib/permission-ui";

export function PermissionPicker({
  preset,
  permissions,
  selectable,
  onPresetChange,
  onPermissionsChange,
}: {
  preset: PermissionPresetId | "";
  permissions: TeamPermission[];
  selectable: readonly TeamPermission[];
  onPresetChange: (preset: PermissionPresetId) => void;
  onPermissionsChange: (permissions: TeamPermission[]) => void;
}) {
  const presetId = useId();
  const allowed = useMemo(() => new Set(selectable), [selectable]);
  const warning = preset && PRESET_WARNINGS[preset];

  function toggle(permission: TeamPermission, checked: boolean) {
    const next = checked
      ? [...new Set([...permissions, permission])]
      : permissions.filter((item) => item !== permission);
    onPermissionsChange(expandPermissionPreset("custom", next));
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor={presetId}>Permission preset</Label>
        <Select
          value={preset}
          onValueChange={(value) => onPresetChange(value as PermissionPresetId)}
        >
          <SelectTrigger id={presetId}>
            <SelectValue placeholder="Choose a preset or Custom" />
          </SelectTrigger>
          <SelectContent>
            {PERMISSION_PRESET_IDS.map((id) => (
              <SelectItem key={id} value={id}>
                {PRESET_LABELS[id]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {warning && <Banner variant="warning">{warning}</Banner>}
      <div className="space-y-4">
        {PERMISSION_GROUPS.map((group) => {
          const visible = group.permissions.filter((permission) =>
            allowed.has(permission),
          );
          if (visible.length === 0) return null;
          return (
            <div key={group.id} className="space-y-2">
              <p className="text-sm font-medium">{group.label}</p>
              {visible.map((permission) => {
                const implied = isImpliedBySelection(permission, permissions);
                const checked = permissions.includes(permission) || implied;
                const highImpact = (
                  HIGH_IMPACT_PERMISSIONS as readonly string[]
                ).includes(permission);
                return (
                  <label key={permission} className="flex items-start gap-2 text-sm">
                    <Checkbox
                      checked={checked}
                      disabled={implied}
                      onCheckedChange={(value) => toggle(permission, value === true)}
                    />
                    <span>
                      {permission}
                      {implied && (
                        <span className="ml-1 text-xs text-muted-foreground">
                          (implied)
                        </span>
                      )}
                      {highImpact && (
                        <span className="ml-1 text-xs text-amber-700">sensitive</span>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
