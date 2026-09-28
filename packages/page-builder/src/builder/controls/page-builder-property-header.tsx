"use client";

import React from "react";
import { HelpCircle } from "lucide-react";

/**
 * Label row for a page-builder design control. Ported from CourseLit's
 * PageBuilderPropertyHeader; the tooltip is rendered via the native `title`
 * attribute so no tooltip dependency is needed.
 */
export function PageBuilderPropertyHeader({
  label,
  tooltip,
}: {
  label: string;
  tooltip?: string;
}) {
  return (
    <div className="flex grow items-center gap-1.5">
      <h2 className="text-xs font-semibold text-foreground">{label}</h2>
      {tooltip && (
        <span title={tooltip} className="inline-flex cursor-help">
          <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
        </span>
      )}
    </div>
  );
}
