"use client";

import * as React from "react";
import {
  defaultPageBuilderLabels,
  resolvePageBuilderLabels,
  type PageBuilderLabels,
} from "../labels";

// Shared through the global registry like the link context: server-rendered
// pages load this module once per client island, and a provider from one copy
// must reach components from another.
const LABELS_CONTEXT_KEY = Symbol.for("@frontlit/page-builder/labels-context");
const globalRegistry = globalThis as typeof globalThis & {
  [LABELS_CONTEXT_KEY]?: React.Context<PageBuilderLabels>;
};
const PageBuilderLabelsContext = (globalRegistry[LABELS_CONTEXT_KEY] ??=
  React.createContext<PageBuilderLabels>(defaultPageBuilderLabels));

/**
 * Translates the built-in text of page-builder components below it
 * (`PageRenderer`, `ThemeModeSwitcher`, dialogs, drawers, the header's mobile
 * menu, code snippets, videos). Labels it leaves out come from an outer
 * provider, then English. A client component: from a server component, pass
 * only string labels.
 */
export function PageBuilderLabelsProvider({
  labels,
  children,
}: {
  labels?: Partial<PageBuilderLabels>;
  children: React.ReactNode;
}) {
  const outer = React.useContext(PageBuilderLabelsContext);
  const value = React.useMemo(
    () => resolvePageBuilderLabels(outer, labels),
    [outer, labels],
  );
  return (
    <PageBuilderLabelsContext.Provider value={value}>
      {children}
    </PageBuilderLabelsContext.Provider>
  );
}

/** The labels in effect: the nearest provider's, with `overrides` laid over them. */
export function usePageBuilderLabels(
  overrides?: Partial<PageBuilderLabels>,
): PageBuilderLabels {
  const labels = React.useContext(PageBuilderLabelsContext);
  return overrides ? resolvePageBuilderLabels(labels, overrides) : labels;
}
