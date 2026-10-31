"use client";

import { useEffect, useId, useState, type ComponentType } from "react";
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
import { PanelSection, ServerUrl } from "./panel-section";
import { playgroundSections, resolveServer } from "./request";

type PlaygroundModule = typeof import("./playground");
let loading: Promise<PlaygroundModule> | null = null;
/** The form is a separate chunk (docs/openapi-support.md §8.3). */
const load = () => (loading ??= import("./playground"));

/**
 * The request panel of an operation page, like Fumadocs': server, method,
 * path and Send, then collapsed sections (Authentication, parameters,
 * Body). The page's HTML has the same collapsed rows, so mounting the form
 * after hydration shifts nothing.
 */
export function RequestPanel({ model }: { model: ApiPlaygroundModel }) {
  const theme = useSiteThemeStyle();
  const formId = useId();
  const [Form, setForm] = useState<PlaygroundModule["Playground"] | null>(null);

  useEffect(() => {
    if (model.unavailable) return;
    let live = true;
    void load().then(({ Playground }) => live && setForm(() => Playground));
    return () => {
      live = false;
    };
  }, [model.unavailable]);

  const server = model.servers[0];
  const baseUrl = server ? resolveServer(server.url, server.variables, {}) : null;
  const Mounted = Form as ComponentType<{
    model: ApiPlaygroundModel;
    theme: typeof theme;
    formId: string;
  }> | null;

  return (
    <PageCard theme={theme} className="overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        <MethodBadge method={model.method} theme={theme} />
        <span className="min-w-0 flex-1">
          <InlineCode theme={theme} className="[overflow-wrap:anywhere]">
            {breakAfterSlashes(model.path)}
          </InlineCode>
        </span>
        <Button
          theme={theme}
          size="sm"
          type="submit"
          form={formId}
          disabled={Boolean(model.unavailable) || !Mounted}
        >
          Send
        </Button>
      </div>
      {model.unavailable ? (
        <div className="border-t border-border px-4 py-2">
          <Caption theme={theme} className="leading-5">
            {model.unavailable}
          </Caption>
        </div>
      ) : Mounted ? (
        <Mounted model={model} theme={theme} formId={formId} />
      ) : (
        <>
          {playgroundSections(model).map((section) => (
            <PanelSection
              key={section.id}
              label={section.label}
              detail={
                section.id === "server" && baseUrl ? (
                  <ServerUrl url={baseUrl} theme={theme} />
                ) : undefined
              }
              collapsible={section.editable !== false}
              theme={theme}
            />
          ))}
        </>
      )}
    </PageCard>
  );
}
