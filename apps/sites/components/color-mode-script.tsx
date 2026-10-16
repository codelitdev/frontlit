"use client";

import { colorModeBootstrapScript } from "@/lib/color-mode";

/**
 * Runs before paint so the first frame matches the stored light / dark /
 * system preference (same job as next-themes). A client component so it
 * can tell server and browser renders apart: when React builds the root
 * layout in the browser (e.g. a 404), the script cannot run anyway, and a
 * non-JS type there stops React warning about a script tag.
 */
export function ColorModeScript() {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: colorModeBootstrapScript }}
    />
  );
}
