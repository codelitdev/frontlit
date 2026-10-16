import React from "react";
import type { WidgetProps } from "../../models";
import type { ThemeStyle } from "../../models";
import { getMediaUrl, getMediaAlt } from "../../models/media";
import type { HeroSettings } from "./settings";
import { renderTitle, titleProps } from "../_shared/title";
import { Image, NavLink, TextRenderer, VideoWithPreview } from "../../components";
import { isVideo } from "../../utils";
import clsx from "clsx";
import {
  Button,
  Caption,
  CodeSnippet,
  Display,
  Preheader,
  Subheader1,
  Section,
  PageCard,
  PageCardContent,
} from "../../primitives";

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

export function HeroWidget({
  settings: {
    preTitle,
    title,
    description,
    buttonCaption,
    buttonAction,
    media,
    youtubeLink,
    alignment = "right",
    mediaRadius = 3,
    contentAlignment = "left",
    secondaryButtonAction,
    secondaryButtonCaption,
    smallPrint,
    command,
    titleLevel,
    titleSize,
    cssId,
    maxWidth,
    verticalPadding,
    background,
    layout = "normal",
  },
  state: { theme },
  nextTheme,
}: WidgetProps<HeroSettings>) {
  const overriddenTheme: ThemeStyle = JSON.parse(JSON.stringify(theme.theme));
  overriddenTheme.structure.page.width = maxWidth || theme.theme.structure.page.width;
  overriddenTheme.structure.section.padding.y =
    verticalPadding || theme.theme.structure.section.padding.y;

  const mediaUrl = getMediaUrl(media);
  const hasHeroGraphic = Boolean(youtubeLink || mediaUrl);
  const direction = alignment === "right" ? "md:!flex-row-reverse" : "md:!flex-row";
  const isCentered = layout === "centered" || layout === "media-below";

  const graphic = hasHeroGraphic && (
    <div
      className={`w-full overflow-hidden ${roundedMap[mediaRadius] ?? "rounded-md"}`}
    >
      {isVideo(youtubeLink, media) ? (
        <VideoWithPreview
          videoUrl={youtubeLink || mediaUrl || ""}
          title={getMediaAlt(media) || (media as any)?.caption || ""}
          thumbnailUrl={(media as any)?.thumbnail || (media as any)?.thumbnailUrl || ""}
        />
      ) : (
        <Image
          src={mediaUrl || ""}
          alt={getMediaAlt(media)}
          borderRadius={mediaRadius}
        />
      )}
    </div>
  );

  const textContent = (
    <div
      className={clsx(
        "flex flex-col gap-4",
        isCentered || contentAlignment === "center"
          ? "items-center text-center"
          : "items-start justify-center h-full",
      )}
    >
      {preTitle && (
        <Preheader theme={overriddenTheme} className="text-muted-foreground">
          {preTitle}
        </Preheader>
      )}
      <Display theme={overriddenTheme} {...titleProps({ titleLevel, titleSize }, "h1")}>
        {renderTitle(title, overriddenTheme)}
      </Display>
      {description && (
        <Subheader1 theme={overriddenTheme} component="span">
          <TextRenderer json={description} theme={overriddenTheme} />
        </Subheader1>
      )}
      <div
        className={clsx(
          "flex flex-col md:!flex-row gap-2 w-full",
          (isCentered || contentAlignment === "center") && "md:!justify-center",
        )}
      >
        {buttonAction && buttonCaption && (
          <NavLink href={buttonAction}>
            <Button theme={overriddenTheme} className="w-full md:min-w-[150px]">
              {buttonCaption}
            </Button>
          </NavLink>
        )}
        {secondaryButtonAction && secondaryButtonCaption && (
          <NavLink href={secondaryButtonAction}>
            <Button
              theme={overriddenTheme}
              variant="secondary"
              className="w-full md:min-w-[150px]"
            >
              {secondaryButtonCaption}
            </Button>
          </NavLink>
        )}
      </div>
      {command && (
        <CodeSnippet
          code={command}
          prompt="$"
          theme={overriddenTheme}
          className="max-w-xl"
        />
      )}
      {smallPrint && <Caption theme={overriddenTheme}>{smallPrint}</Caption>}
    </div>
  );

  let mainContent: React.ReactNode;
  if (layout === "centered") {
    // Text-only, no media — the minimalist SaaS hero (Linear, Vercel).
    mainContent = (
      <div className="mx-auto flex max-w-2xl flex-col gap-4">{textContent}</div>
    );
  } else if (layout === "media-below") {
    // Centered headline with a large screenshot/media beneath it — the
    // classic "product hero" pattern (Stripe, Vercel, Linear).
    mainContent = (
      <div className="flex flex-col gap-10">
        <div className="mx-auto flex max-w-2xl flex-col gap-4">{textContent}</div>
        {graphic && <div className="w-full">{graphic}</div>}
      </div>
    );
  } else {
    mainContent = (
      <div className={clsx("flex flex-col gap-8", direction)}>
        {graphic && <div className="w-full md:w-1/2 flex items-center">{graphic}</div>}
        <div className={`w-full ${hasHeroGraphic ? "md:w-1/2" : ""}`}>
          {textContent}
        </div>
      </div>
    );
  }

  return (
    <Section
      theme={overriddenTheme}
      id={cssId}
      background={background}
      nextTheme={nextTheme}
    >
      {layout === "card" ? (
        <PageCard theme={overriddenTheme}>
          <PageCardContent theme={overriddenTheme}>{mainContent}</PageCardContent>
        </PageCard>
      ) : (
        mainContent
      )}
    </Section>
  );
}
