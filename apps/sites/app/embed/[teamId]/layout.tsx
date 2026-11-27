import type { Metadata } from "next";
import { BUILD_TEAM_ID } from "@/lib/api";
import { lightModeLockScript } from "@/lib/color-mode";

/** The chat iframe on the embed host (docs/embedded-support.md §6.3). Teams
 * aren't known at build time; real teams render on their first request. */
export function generateStaticParams() {
  return [{ teamId: BUILD_TEAM_ID }];
}

export const metadata: Metadata = {
  title: "Chat",
  robots: { index: false, follow: false },
};

export default function EmbedLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* The chat stays light: the loader draws its launcher and frame in
          light colors on the host page, and the panel paints with the
          theme's light palette. Runs before paint, after the root layout's
          color mode script. */}
      <script dangerouslySetInnerHTML={{ __html: lightModeLockScript }} />
      {children}
    </>
  );
}
