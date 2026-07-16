import type { WidgetInstance, PageType } from "./widget";
import type { Media } from "./media";

/** Page-level SEO settings, editable from the builder's SEO panel. */
export interface PageSeo {
    /** Page title for search results and the browser tab. */
    title?: string;
    /** Short summary shown in search results and link previews. */
    description?: string;
    /** Social card (Open Graph) image shown when the page is shared. */
    socialImage?: Media;
    /** When false, the page asks search engines not to index it. */
    robotsAllowed?: boolean;
}

export interface Page {
    pageId: string;
    name: string;
    type: PageType;
    layout: WidgetInstance[];
    title?: string;
    description?: string;
    socialImage?: Media;
    robotsAllowed?: boolean;
}
