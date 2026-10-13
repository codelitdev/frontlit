import { useState } from "react";
import {
  PageBuilder,
  PageRenderer,
  createDefaultLayout,
  getDefaultTheme,
  type PageBuilderState,
  type Theme,
  type WidgetInstance,
} from "@frontlit/page-builder";
import "@frontlit/page-builder/styles.css";
import { DemoLink } from "./demo-link";

const PAGE_DATA = { pageType: "landing" as const };

export function PageBuilderDemo({ pane }: { pane: "builder" | "published" }) {
  const [layout, setLayout] = useState<WidgetInstance[]>(() => createDefaultLayout());
  const [theme, setTheme] = useState<Theme>(() => getDefaultTheme());

  function handleChange(state: PageBuilderState) {
    setLayout(state.layout);
    setTheme(state.theme);
  }

  return (
    <>
      <div
        className="demo-stage"
        hidden={pane !== "builder"}
        aria-hidden={pane !== "builder"}
      >
        <PageBuilder
          pageData={PAGE_DATA}
          initialLayout={layout}
          initialTheme={theme}
          onChange={handleChange}
          linkComponent={DemoLink}
          className="h-full"
        />
      </div>
      <div
        className="demo-stage demo-stage--scroll"
        hidden={pane !== "published"}
        aria-hidden={pane !== "published"}
      >
        <PageRenderer
          layout={layout}
          theme={theme}
          pageData={PAGE_DATA}
          linkComponent={DemoLink}
        />
      </div>
    </>
  );
}
