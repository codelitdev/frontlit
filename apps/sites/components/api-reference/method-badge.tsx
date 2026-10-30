import { Badge } from "@frontlit/page-builder/primitives/server";
import type { ThemeStyle } from "@frontlit/page-builder/models";

type Variant = "default" | "secondary" | "destructive" | "outline";

/** Theme tokens only (docs/openapi-support.md §6.4 "Theme"). */
function methodVariant(method: string): Variant {
  switch (method.toLowerCase()) {
    case "get":
      return "secondary";
    case "post":
      return "default";
    case "delete":
      return "destructive";
    default:
      return "outline";
  }
}

function statusVariant(status: string): Variant {
  // Primary, not secondary: some themes (Editorial) use a red-orange
  // secondary that reads like the destructive 5xx badge.
  if (/^2/.test(status)) return "default";
  if (/^5/.test(status)) return "destructive";
  return "outline";
}

const LABELS: Record<string, string> = { delete: "DEL", options: "OPT" };

export function MethodBadge({
  method,
  theme,
  compact = false,
}: {
  method: string;
  theme: ThemeStyle;
  compact?: boolean;
}) {
  const lower = method.toLowerCase();
  return (
    <Badge
      theme={theme}
      variant={methodVariant(lower)}
      className={
        compact
          ? "min-w-[2.75rem] justify-center px-1 py-0 text-[0.625rem] uppercase leading-4"
          : "uppercase"
      }
    >
      {compact ? (LABELS[lower] ?? lower.toUpperCase()) : lower.toUpperCase()}
    </Badge>
  );
}

export function StatusBadge({ status, theme }: { status: string; theme: ThemeStyle }) {
  return (
    <Badge theme={theme} variant={statusVariant(status)}>
      {status}
    </Badge>
  );
}
