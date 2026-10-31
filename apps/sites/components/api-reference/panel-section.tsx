import type React from "react";
import {
  Collapsible,
  InlineCode,
  Text2,
} from "@frontlit/page-builder/primitives/server";
import type { ThemeStyle } from "@frontlit/page-builder/models";

/** One row of the request panel (Server, Authentication, Path parameters,
 * Body…). Rendered identically before and after the form loads. A row with
 * nothing to edit is plain; the others collapse. */
export function PanelSection({
  label,
  detail,
  theme,
  defaultOpen,
  collapsible = true,
  children,
}: {
  label: string;
  /** Shown next to the label, e.g. the server URL. */
  detail?: React.ReactNode;
  theme: ThemeStyle;
  defaultOpen?: boolean;
  collapsible?: boolean;
  children?: React.ReactNode;
}) {
  const summary = (
    <span className="flex min-w-0 items-center gap-3">
      <Text2 theme={theme} component="span" className="shrink-0 font-medium">
        {label}
      </Text2>
      {detail}
    </span>
  );
  if (!collapsible)
    return <div className="border-t border-border px-4 py-2 pl-10">{summary}</div>;
  return (
    <Collapsible
      variant="plain"
      theme={theme}
      defaultOpen={defaultOpen}
      className="border-t border-border px-4 py-2"
      summary={summary}
    >
      <div className="flex flex-col gap-3 pt-2 pb-2">{children}</div>
    </Collapsible>
  );
}

/** The server URL shown in the Server row. */
export function ServerUrl({ url, theme }: { url: string; theme: ThemeStyle }) {
  return (
    <InlineCode theme={theme} variant="muted" className="min-w-0 truncate">
      {url}
    </InlineCode>
  );
}
