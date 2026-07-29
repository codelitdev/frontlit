import type { SharedWidgetsRow, WidgetInstanceRow } from "../db/schema";
import { DEFAULT_SHARED_WIDGETS } from "../db/schema";
import { genId } from "../db/id";

export const SHARED_WIDGET_NAMES = ["header", "footer"] as const;
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
        deleteable: false,
        shared: true,
    };
}

/** New/seeded pages always start with the two required layout placeholders. */
export function createRequiredSharedWidgetPlaceholders(): WidgetInstanceRow[] {
    return [lockedPlaceholder("header"), lockedPlaceholder("footer")];
}

/** Canonicalizes historical stored layouts without losing body blocks.
 * Existing placeholder ids are preserved so builder selection remains stable. */
export function repairStoredLayout(
    layout: WidgetInstanceRow[],
): WidgetInstanceRow[] {
    const header = layout.find((widget) => widget.name === "header");
    const footer = layout.find((widget) => widget.name === "footer");
    const body = layout.filter((widget) => !isSharedWidgetName(widget.name));
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
    const body = layout.filter((widget) => !isSharedWidgetName(widget.name));

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
                deleteable: false,
                shared: true,
                settings: header.settings ?? {},
            },
            footer: {
                ...currentSharedWidgets.footer,
                name: "footer",
                deleteable: false,
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
): WidgetInstanceRow[] {
    const repaired = repairStoredLayout(layout);
    return repaired.map((widget) => {
        if (!isSharedWidgetName(widget.name)) return widget;
        const shared = sharedWidgets[widget.name];
        return {
            ...shared,
            widgetId: widget.widgetId,
            name: widget.name,
            deleteable: false,
            shared: true,
            settings: shared.settings ?? {},
        };
    });
}
