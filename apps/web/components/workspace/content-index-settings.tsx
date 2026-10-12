"use client";

import { Label } from "@/components/ui/codelit/label";
import { Switch } from "@/components/ui/codelit/switch";

export function ContentIndexSettings({
  checked,
  disabled,
  onCheckedChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="border-t pt-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Label htmlFor="content-indexable">Include in search and chatbot</Label>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            When on, the published page is chunked for site search and AI answers. Turn
            off to keep the page live but out of retrieval.
          </p>
        </div>
        <Switch
          id="content-indexable"
          checked={checked}
          disabled={disabled}
          onCheckedChange={onCheckedChange}
        />
      </div>
    </div>
  );
}
