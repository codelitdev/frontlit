import React from "react";
import type { ThemeStyle, WidgetProps } from "../../models";
import { getMediaUrl, getMediaAlt } from "../../models/media";
import type { MediaSettings } from "./settings";
import { Image, VideoWithPreview } from "../../components";
import { isVideo } from "../../utils";
import { Section } from "../../primitives";
import { cn } from "../../primitives/lib/utils";

const roundedMap: Record<number, string> = {
  0: "rounded-none",
  1: "rounded-sm",
  2: "rounded",
  3: "rounded-md",
  4: "rounded-lg",
  5: "rounded-xl",
  6: "rounded-2xl",
  7: "rounded-3xl",
  8: "rounded-full",
};

export function MediaWidget({
  settings: {
    media,
    youtubeLink,
    mediaRadius = 2,
    aspectRatio = "16/9",
    objectFit = "cover",
    hasBorder = true,
    playVideoInModal = false,
    cssId,
    maxWidth,
    verticalPadding,
    background,
  },
  state: { theme },
  nextTheme,
}: WidgetProps<MediaSettings>) {
  const overriddenTheme: ThemeStyle = JSON.parse(JSON.stringify(theme.theme));
  overriddenTheme.structure.page.width = maxWidth || theme.theme.structure.page.width;
  overriddenTheme.structure.section.padding.y =
    verticalPadding || theme.theme.structure.section.padding.y;

  const isVideoContent = isVideo(youtubeLink, media);

  return (
    <Section
      theme={overriddenTheme}
      id={cssId}
      background={background}
      nextTheme={nextTheme}
    >
      <div
        className={cn(
          "overflow-hidden",
          roundedMap[mediaRadius] ?? "rounded",
          hasBorder && (overriddenTheme.interactives?.card?.border?.width || "border"),
        )}
      >
        {isVideoContent ? (
          <VideoWithPreview
            videoUrl={youtubeLink || getMediaUrl(media) || ""}
            title={getMediaAlt(media) || (media as any)?.caption || ""}
            thumbnailUrl={
              (media as any)?.thumbnail || (media as any)?.thumbnailUrl || ""
            }
            aspectRatio={aspectRatio}
            modal={playVideoInModal}
          />
        ) : (
          <Image
            src={getMediaUrl(media) || ""}
            alt={getMediaAlt(media)}
            objectFit={objectFit}
            borderRadius={mediaRadius}
          />
        )}
      </div>
    </Section>
  );
}
