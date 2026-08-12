import type { Widget } from "../../models";
import { pageContentMetadata } from "./metadata";
import { PageContentWidget } from "./widget";

export const PageContent: Widget = {
    metadata: pageContentMetadata,
    widget: PageContentWidget,
};
