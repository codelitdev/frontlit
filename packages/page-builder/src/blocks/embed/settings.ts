import type { WidgetDefaultSettings } from "../../models";

export interface EmbedSettings extends WidgetDefaultSettings {
    contentType?: "url" | "script";
    content?: string;
    /** Colon-separated, matching common video-embed aspect ratio labels. */
    aspectRatio?: "16:9" | "4:3" | "1:1" | "default";
    /** Fixed height in px, used only when `aspectRatio` is "default". */
    height?: number;
}
