import type { Media, WidgetDefaultSettings } from "../../models";
import type { AspectRatio } from "../../components/video-with-preview";
import type { ImageObjectFit } from "../../components/image";

export interface MediaSettings extends WidgetDefaultSettings {
    media?: Media;
    youtubeLink?: string;
    mediaRadius?: number;
    aspectRatio?: AspectRatio;
    objectFit?: ImageObjectFit;
    hasBorder?: boolean;
    playVideoInModal?: boolean;
}
