import type { SharedWidgetsRow, WidgetInstanceRow } from "../db/schema";
import { DEFAULT_SHARED_WIDGETS } from "../db/schema";
import { genId } from "../db/id";

export const SHARED_WIDGET_NAMES = ["header", "footer"] as const;
/** FrontLit reserves the generic core data slot for its standard content pages. */
export const DATA_SLOT_WIDGET_NAME = "data-slot" as const;
export const CONTENT_FEED_SLOT = "content-feed" as const;
export const CONTENT_FEED_SOURCES = {
  blog: "articles",
  docs: "documentation",
  changelog: "product-updates",
} as const;
export type ContentFeedSource =
  (typeof CONTENT_FEED_SOURCES)[keyof typeof CONTENT_FEED_SOURCES];
type SharedWidgetName = (typeof SHARED_WIDGET_NAMES)[number];

export class InvalidPageLayoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidPageLayoutError";
  }
}

function isSharedWidgetName(name: string): name is SharedWidgetName {
  return SHARED_WIDGET_NAMES.includes(name as SharedWidgetName);
}

function lockedPlaceholder(
  name: SharedWidgetName,
  widgetId = genId(),
): WidgetInstanceRow {
  return {
    widgetId,
    name,
    deletable: false,
    moveable: false,
    shared: true,
  };
}

function frontlitContentFeedPlaceholder(
  pageSlug: string,
  widgetId = genId(),
): WidgetInstanceRow {
  const source = CONTENT_FEED_SOURCES[pageSlug as keyof typeof CONTENT_FEED_SOURCES] as
    | ContentFeedSource
    | undefined;
  if (!source) {
    throw new InvalidPageLayoutError(
      `Page "${pageSlug}" does not have a content feed source.`,
    );
  }
  return {
    widgetId,
    name: DATA_SLOT_WIDGET_NAME,
    deletable: false,
    moveable: true,
    shared: false,
    settings: { slot: CONTENT_FEED_SLOT, source },
  };
}

export function pageRequiresFrontlitContentFeed(slug: string): boolean {
  return CONTENT_FEED_SOURCES[slug as keyof typeof CONTENT_FEED_SOURCES] !== undefined;
}

/** New/seeded pages always start with the two required layout placeholders. */
export function createRequiredSharedWidgetPlaceholders(): WidgetInstanceRow[] {
  return [lockedPlaceholder("header"), lockedPlaceholder("footer")];
}

/** Builds a complete canonical layout for a seeded page. Standard dynamic
 * indexes receive their required FrontLit data slot before optional blocks. */
export function createRequiredPageLayout(
  pageSlug: string,
  body: WidgetInstanceRow[] = [],
): WidgetInstanceRow[] {
  const [header, footer] = createRequiredSharedWidgetPlaceholders();
  return [
    header,
    ...(pageRequiresFrontlitContentFeed(pageSlug)
      ? [frontlitContentFeedPlaceholder(pageSlug)]
      : []),
    ...body,
    footer,
  ];
}

/** Canonicalizes historical stored layouts without losing body blocks.
 * Existing placeholder ids are preserved so builder selection remains stable. */
export function repairStoredLayout(
  layout: WidgetInstanceRow[],
  pageSlug = "",
): WidgetInstanceRow[] {
  const header = layout.find((widget) => widget.name === "header");
  const footer = layout.find((widget) => widget.name === "footer");
  const requiresContent = pageRequiresFrontlitContentFeed(pageSlug);
  const existingContent = layout.find(
    (widget) => widget.name === DATA_SLOT_WIDGET_NAME,
  );
  let body = layout.filter(
    (widget) =>
      !isSharedWidgetName(widget.name) && widget.name !== DATA_SLOT_WIDGET_NAME,
  );
  if (requiresContent) {
    const content = frontlitContentFeedPlaceholder(pageSlug, existingContent?.widgetId);
    if (existingContent) {
      const originalIndex = layout.findIndex(
        (widget) => widget.widgetId === existingContent.widgetId,
      );
      const precedingBodyCount = layout
        .slice(0, originalIndex)
        .filter(
          (widget) =>
            !isSharedWidgetName(widget.name) && widget.name !== DATA_SLOT_WIDGET_NAME,
        ).length;
      body = [
        ...body.slice(0, precedingBodyCount),
        content,
        ...body.slice(precedingBodyCount),
      ];
    } else {
      body = [content, ...body];
    }
  }
  return [
    lockedPlaceholder("header", header?.widgetId),
    ...body,
    lockedPlaceholder("footer", footer?.widgetId),
  ];
}

/** Rejects client attempts to remove or duplicate mandatory layout blocks,
 * and returns the page-local placeholder layout stored in `pages`. */
export function splitSubmittedLayout(
  layout: WidgetInstanceRow[],
  currentSharedWidgets: SharedWidgetsRow,
  pageSlug = "",
): { storedLayout: WidgetInstanceRow[]; sharedWidgets: SharedWidgetsRow } {
  const headers = layout.filter((widget) => widget.name === "header");
  const footers = layout.filter((widget) => widget.name === "footer");
  if (headers.length !== 1 || footers.length !== 1) {
    throw new InvalidPageLayoutError(
      "Every page must contain exactly one header and one footer.",
    );
  }

  const header = headers[0];
  const footer = footers[0];
  const contentBlocks = layout.filter(
    (widget) => widget.name === DATA_SLOT_WIDGET_NAME,
  );
  const requiresContent = pageRequiresFrontlitContentFeed(pageSlug);
  if (requiresContent && contentBlocks.length !== 1) {
    throw new InvalidPageLayoutError(
      "This standard page must contain exactly one FrontLit content data slot.",
    );
  }
  if (!requiresContent && contentBlocks.length > 0) {
    throw new InvalidPageLayoutError(
      "Only standard content pages can contain the FrontLit content data slot.",
    );
  }
  const body = layout
    .filter((widget) => !isSharedWidgetName(widget.name))
    .map((widget) =>
      widget.name === DATA_SLOT_WIDGET_NAME
        ? frontlitContentFeedPlaceholder(pageSlug, widget.widgetId)
        : widget,
    );

  return {
    storedLayout: [
      lockedPlaceholder("header", header.widgetId),
      ...body,
      lockedPlaceholder("footer", footer.widgetId),
    ],
    sharedWidgets: {
      header: {
        ...currentSharedWidgets.header,
        name: "header",
        deletable: false,
        moveable: false,
        shared: true,
        settings: header.settings ?? {},
      },
      footer: {
        ...currentSharedWidgets.footer,
        name: "footer",
        deletable: false,
        moveable: false,
        shared: true,
        settings: footer.settings ?? {},
      },
    },
  };
}

/** Resolves page placeholders against the team's single shared settings
 * source. Page-local widget ids are retained for stable editing controls. */
export function hydrateSharedWidgets(
  layout: WidgetInstanceRow[],
  sharedWidgets: SharedWidgetsRow = DEFAULT_SHARED_WIDGETS,
  pageSlug = "",
): WidgetInstanceRow[] {
  const repaired = repairStoredLayout(layout, pageSlug);
  return repaired.map((widget) => {
    if (!isSharedWidgetName(widget.name)) return widget;
    const shared = sharedWidgets[widget.name];
    return {
      ...shared,
      widgetId: widget.widgetId,
      name: widget.name,
      deletable: false,
      moveable: false,
      shared: true,
      settings: shared.settings ?? {},
    };
  });
}
