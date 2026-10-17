"use client";

import { useState } from "react";
import {
  PageBuilder,
  createDefaultLayout,
  getDefaultTheme,
  type WidgetInstance,
} from "@frontlit/page-builder";
import { toSiteBranding } from "@frontlit/api-contract";

export function PageBuilderDemo() {
  const [layout] = useState<WidgetInstance[]>(() => createDefaultLayout());
  const [theme] = useState(() => getDefaultTheme());

  return (
    <div className="page-builder-demo">
      <div className="page-builder-demo__header">
        <h3>PageBuilder</h3>
        <p>The full WYSIWYG editor — add, remove, reorder and edit blocks.</p>
      </div>
      <div className="page-builder-demo__body page-builder-demo__tall">
        <PageBuilder
          pageData={{ pageType: "landing", ...toSiteBranding(null) }}
          initialLayout={layout}
          initialTheme={theme}
          className="h-full"
        />
      </div>
    </div>
  );
}
