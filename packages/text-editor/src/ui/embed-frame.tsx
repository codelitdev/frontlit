"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  EMBED_DEFAULT_HEIGHT,
  EMBED_MAX_HEIGHT,
  EMBED_MIN_HEIGHT,
  EMBED_SANDBOX,
} from "../core/library/embed";

export const clampEmbedHeight = (value: number) =>
  Math.min(EMBED_MAX_HEIGHT, Math.max(EMBED_MIN_HEIGHT, Math.ceil(value)));

/**
 * The height an embed asked for, or null. Only messages from this frame's own
 * window count, and only a finite number, capped (§10 L3).
 */
export function embedHeightFromMessage(
  event: Pick<MessageEvent, "source" | "data">,
  frame: Window | null | undefined,
): number | null {
  if (!frame || event.source !== frame) return null;
  const data = event.data as unknown;
  const height =
    typeof data === "number"
      ? data
      : data && typeof data === "object"
        ? (data as { height?: unknown }).height
        : undefined;
  if (typeof height !== "number" || !Number.isFinite(height)) return null;
  return clampEmbedHeight(height);
}

/**
 * Author code runs only here: a `srcdoc` frame sandboxed to scripts, popups
 * and forms. Never `allow-same-origin`: a `srcdoc` frame would inherit the
 * page's origin, cookies and storage.
 */
export function EmbedFrame({
  code,
  title,
  height,
  className,
}: {
  code: string;
  title?: string | null;
  height?: number | null;
  className?: string;
}) {
  const ref = useRef<HTMLIFrameElement | null>(null);
  const [current, setCurrent] = useState(
    clampEmbedHeight(height ?? EMBED_DEFAULT_HEIGHT),
  );
  useEffect(() => {
    setCurrent(clampEmbedHeight(height ?? EMBED_DEFAULT_HEIGHT));
  }, [height]);
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const next = embedHeightFromMessage(event, ref.current?.contentWindow);
      if (next !== null) setCurrent(next);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);
  return (
    <iframe
      ref={ref}
      className={className ?? "te-embed"}
      title={title || "Embedded content"}
      srcDoc={code}
      sandbox={EMBED_SANDBOX}
      referrerPolicy="no-referrer"
      loading="lazy"
      style={{ width: "100%", height: current, border: 0 }}
    />
  );
}
