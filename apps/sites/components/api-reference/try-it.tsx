"use client";

import { useEffect, useId, useRef, useState, type ComponentType } from "react";
import { Play, X } from "lucide-react";
import type { ApiPlaygroundModel } from "@frontlit/api-contract";
import {
  Button,
  Caption,
  InlineCode,
  PageCard,
} from "@frontlit/page-builder/primitives/server";
import { useSiteThemeStyle } from "@/lib/site-theme-context";
import { MethodBadge } from "./method-badge";
import { breakAfterSlashes } from "./break-path";
import { resolveServer } from "./request";

type PlaygroundModule = typeof import("./playground");
let loading: Promise<PlaygroundModule> | null = null;
/** The form is a separate chunk, fetched on intent (idle, hover, focus) and
 * mounted inline on click (docs/openapi-support.md §8.3). */
const load = () => (loading ??= import("./playground"));

/**
 * The request bar at the top of an operation page: server, method and path,
 * rendered as plain HTML. "Try it" opens the playground form inline below it,
 * and the bar's button then sends the request.
 */
export function RequestPanel({ model }: { model: ApiPlaygroundModel }) {
  const theme = useSiteThemeStyle();
  const formId = useId();
  const [Form, setForm] = useState<PlaygroundModule["Playground"] | null>(null);
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (model.unavailable) return;
    if ("requestIdleCallback" in window) {
      const handle = window.requestIdleCallback(() => void load(), { timeout: 5000 });
      return () => window.cancelIdleCallback(handle);
    }
    const handle = setTimeout(() => void load(), 3000);
    return () => clearTimeout(handle);
  }, [model.unavailable]);

  // Opening moves focus to the form's first field; closing returns it.
  useEffect(() => {
    if (open && Form)
      [
        ...(panel.current?.querySelectorAll<HTMLElement>("input, select, textarea") ??
          []),
      ]
        .find((field) => field.offsetParent !== null)
        ?.focus();
  }, [open, Form]);

  const server = model.servers[0];
  const baseUrl = server ? resolveServer(server.url, server.variables, {}) : null;
  const Mounted = Form as ComponentType<{
    model: ApiPlaygroundModel;
    theme: typeof theme;
    formId: string;
  }> | null;

  return (
    <PageCard theme={theme} className="overflow-hidden">
      {baseUrl ? (
        <div className="flex min-w-0 items-center gap-2 border-b border-border px-4 py-2">
          <Caption theme={theme} className="shrink-0">
            Server
          </Caption>
          <InlineCode theme={theme} variant="muted" className="min-w-0 truncate">
            {baseUrl}
          </InlineCode>
        </div>
      ) : null}
      <div ref={bar} className="flex items-center gap-3 px-4 py-3">
        <MethodBadge method={model.method} theme={theme} />
        <span className="min-w-0 flex-1">
          <InlineCode theme={theme} className="[overflow-wrap:anywhere]">
            {breakAfterSlashes(model.path)}
          </InlineCode>
        </span>
        {open ? (
          <>
            <Button theme={theme} size="sm" type="submit" form={formId}>
              Send
            </Button>
            <Button
              theme={theme}
              variant="ghost"
              size="icon"
              aria-label="Close"
              onClick={() => {
                setOpen(false);
                setTimeout(() => bar.current?.querySelector("button")?.focus(), 0);
              }}
            >
              <X aria-hidden="true" />
            </Button>
          </>
        ) : (
          <Button
            theme={theme}
            size="sm"
            disabled={Boolean(model.unavailable)}
            onMouseEnter={() => void load()}
            onFocus={() => void load()}
            onClick={async () => {
              const { Playground } = await load();
              setForm(() => Playground);
              setOpen(true);
            }}
          >
            <Play aria-hidden="true" />
            Try it
          </Button>
        )}
      </div>
      {model.unavailable ? (
        <div className="border-t border-border px-4 py-2">
          <Caption theme={theme} className="leading-5">
            {model.unavailable}
          </Caption>
        </div>
      ) : null}
      {open && Mounted ? (
        <div ref={panel} className="border-t border-border p-4">
          <Mounted model={model} theme={theme} formId={formId} />
        </div>
      ) : null}
    </PageCard>
  );
}
