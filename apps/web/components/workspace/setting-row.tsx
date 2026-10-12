import type { ReactNode } from "react";
import { Badge } from "@/components/ui/codelit/badge";

/** One row of a settings list: icon tile, title with optional badge, description and an action. */
export function SettingRow({
  icon,
  title,
  badge,
  description,
  children,
}: {
  icon: ReactNode;
  title: string;
  badge?: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 px-6 py-5 sm:flex-row sm:items-center">
      <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-[var(--primary-soft)] text-primary [&>svg]:size-5">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2.5">
          <p className="font-medium">{title}</p>
          {badge && <Badge variant="neutral">{badge}</Badge>}
        </div>
        <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
