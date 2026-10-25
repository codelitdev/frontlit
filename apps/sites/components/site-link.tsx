"use client";

import Link from "next/link";
import { useState, type ComponentProps } from "react";

/**
 * `next/link` that prefetches on intent (hover, focus, touch) instead of
 * whenever it scrolls into view. Public pages are fully cached, so a
 * viewport prefetch downloads each linked page, its data and its preloaded
 * hero image; a docs sidebar alone would fetch every article up front.
 */
export function SiteLink({
  onMouseEnter,
  onFocus,
  onTouchStart,
  ...props
}: ComponentProps<typeof Link>) {
  const [intent, setIntent] = useState(false);
  return (
    <Link
      {...props}
      prefetch={intent ? props.prefetch : false}
      onMouseEnter={(event) => {
        setIntent(true);
        onMouseEnter?.(event);
      }}
      onFocus={(event) => {
        setIntent(true);
        onFocus?.(event);
      }}
      onTouchStart={(event) => {
        setIntent(true);
        onTouchStart?.(event);
      }}
    />
  );
}
