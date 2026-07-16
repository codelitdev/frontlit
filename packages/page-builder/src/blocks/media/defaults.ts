import type { MediaSettings } from "./settings";

export const mediaDefaults: Partial<MediaSettings> = {
    mediaRadius: 2,
    aspectRatio: "16/9",
    objectFit: "cover",
    hasBorder: true,
    playVideoInModal: false,
};
