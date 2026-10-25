"use client";

import { useEffect, useRef, useState, type ComponentType } from "react";
import { Play } from "lucide-react";
import type { ApiPlaygroundModel } from "@frontlit/api-contract";
import { Button, Caption } from "@frontlit/page-builder/primitives/server";
import { useSiteThemeStyle } from "@/lib/site-theme-context";

type PlaygroundModule = typeof import("./playground");
let loading: Promise<PlaygroundModule> | null = null;
/** The playground is a separate chunk, fetched on intent (idle, hover,
 * focus) and mounted on click (docs/openapi-support.md §8.3). */
const load = () => (loading ??= import("./playground"));

export function TryIt({
  model,
  title,
  className,
}: {
  model: ApiPlaygroundModel;
  title: string;
  className?: string;
}) {
  const theme = useSiteThemeStyle();
  const [Panel, setPanel] = useState<PlaygroundModule["Playground"] | null>(null);
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (model.unavailable) return;
    if ("requestIdleCallback" in window) {
      const handle = window.requestIdleCallback(() => void load(), { timeout: 5000 });
      return () => window.cancelIdleCallback(handle);
    }
    const handle = setTimeout(() => void load(), 3000);
    return () => clearTimeout(handle);
  }, [model.unavailable]);

  if (model.unavailable)
    return (
      <div className={className}>
        <Button theme={theme} disabled className="w-full">
          <Play aria-hidden="true" />
          Try it
        </Button>
        <Caption theme={theme} className="mt-1 block leading-5">
          {model.unavailable}
        </Caption>
      </div>
    );

  const Mounted = Panel as ComponentType<{
    model: ApiPlaygroundModel;
    title: string;
    theme: typeof theme;
    onClose: () => void;
  }> | null;
  return (
    <div ref={wrapper} className={className}>
      <Button
        theme={theme}
        className="w-full"
        onMouseEnter={() => void load()}
        onFocus={() => void load()}
        onClick={async () => {
          const { Playground } = await load();
          setPanel(() => Playground);
          setOpen(true);
        }}
      >
        <Play aria-hidden="true" />
        Try it
      </Button>
      {open && Mounted ? (
        <Mounted
          model={model}
          title={title}
          theme={theme}
          onClose={() => {
            setOpen(false);
            // After the dialog unmounts and the browser's own focus handling.
            setTimeout(() => wrapper.current?.querySelector("button")?.focus(), 0);
          }}
        />
      ) : null}
    </div>
  );
}
