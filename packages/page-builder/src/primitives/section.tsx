import React from "react";
import type { SectionBackground, ThemeStyle } from "../models";
import { getMediaUrl } from "../models/media";
import { cn } from "./lib/utils";

interface SectionProps extends React.HTMLAttributes<HTMLElement> {
  children: React.ReactNode;
  className?: string;
  theme?: ThemeStyle;
  component?: "header" | "footer" | "section";
  background?: SectionBackground;
}

type CssVars = React.CSSProperties & Record<`--${string}`, string | undefined>;

/**
 * Dark-mode variants are resolved in CSS (`dark:` utilities reading custom
 * properties) rather than in JS, so a server-rendered section paints the
 * right palette without knowing the visitor's colour mode.
 */
function resolveBackgroundLayer(background: SectionBackground): {
  className?: string;
  style: CssVars;
} {
  const attachment = background.backgroundAttachment || "scroll";

  if (background.type === "color") {
    return {
      className:
        "[background-color:var(--pb-bg)] dark:[background-color:var(--pb-bg-dark,var(--pb-bg))]",
      style: {
        "--pb-bg": background.backgroundColor,
        "--pb-bg-dark": background.backgroundColorDark,
      },
    };
  }

  if (background.type === "image") {
    const bgUrl = getMediaUrl(background.media);
    return {
      style: {
        backgroundImage: bgUrl ? `url(${bgUrl})` : undefined,
        backgroundSize: background.backgroundSize || "cover",
        backgroundPosition: background.backgroundPosition || "center",
        backgroundRepeat: background.backgroundRepeat || "no-repeat",
        backgroundAttachment: attachment,
        maskImage: background.maskImage,
        WebkitMaskImage: background.maskImage,
      },
    };
  }

  // Pattern / gradient
  return {
    className:
      "[background-image:var(--pb-bg-image)] dark:[background-image:var(--pb-bg-image-dark,var(--pb-bg-image))]",
    style: {
      "--pb-bg-image": background.backgroundImage,
      "--pb-bg-image-dark": background.backgroundImageDark,
      backgroundSize: background.gradientBackgroundSize || "cover",
      backgroundPosition: background.gradientBackgroundPosition || "center",
      backgroundRepeat: background.gradientBackgroundRepeat || "no-repeat",
      backgroundAttachment: attachment,
      maskImage: background.gradientMaskImage,
      WebkitMaskImage: background.gradientMaskImage,
    },
  };
}

export const Section: React.FC<SectionProps> = ({
  children,
  className = "",
  theme,
  background,
  component = "section",
  ...props
}) => {
  const classes = cn(
    "bg-background text-foreground relative",
    component === "section" &&
      theme?.structure?.section?.dividers &&
      "border-t border-border",
    className,
  );
  const backgroundLayer = background ? resolveBackgroundLayer(background) : null;
  const isFixed =
    background &&
    background.type !== "color" &&
    background.backgroundAttachment === "fixed";

  return (
    <>
      {React.createElement(
        component as React.ElementType,
        {
          // `overflow-clip` keeps a fixed-attachment layer painted
          // only within the section bounds without creating a new
          // scroll container (unlike overflow-hidden in some cases).
          className: cn(classes, isFixed && "overflow-clip"),
          ...props,
        },
        <>
          {backgroundLayer && (
            <div
              aria-hidden
              className={cn(
                "pointer-events-none absolute inset-0 z-0",
                backgroundLayer.className,
              )}
              style={backgroundLayer.style}
            />
          )}
          {background && background.type === "image" && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 z-[1] [background-color:var(--pb-overlay)] dark:[background-color:var(--pb-overlay-dark,var(--pb-overlay))]"
              style={
                {
                  "--pb-overlay": background?.overlay?.color,
                  "--pb-overlay-dark": background?.overlay?.colorDark,
                  opacity: background?.overlay?.opacity
                    ? background.overlay.opacity / 10
                    : 0,
                  mixBlendMode: background?.overlay?.blendMode,
                } as CssVars
              }
            />
          )}
          {background && background.type === "image" && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 z-[2]"
              style={{
                backdropFilter: background?.blur
                  ? `blur(${background?.blur}px)`
                  : undefined,
              }}
            />
          )}
          <div
            className={cn(
              "mx-auto z-[3] relative overflow-hidden",
              `lg:${theme?.structure?.page?.width || "max-w-6xl"}`,
              theme?.structure?.section?.padding?.x || "px-4",
              theme?.structure?.section?.padding?.y || "py-4",
            )}
          >
            {children}
          </div>
        </>,
      )}
    </>
  );
};
