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
  /** @deprecated Unused: light/dark is resolved in CSS so SSR matches the visitor's mode. */
  nextTheme?: "dark" | "light";
}

type CssVars = React.CSSProperties & Record<`--pb-${string}`, string | undefined>;

// Both variants are emitted as CSS variables and picked by the `dark` class
// (set on <html> before paint), so server HTML never paints the wrong mode.
const COLOR_LAYER_CLASS =
  "[background-color:var(--pb-bg)] dark:[background-color:var(--pb-bg-dark,var(--pb-bg))]";
const GRADIENT_LAYER_CLASS =
  "[background-image:var(--pb-bg-image)] dark:[background-image:var(--pb-bg-image-dark,var(--pb-bg-image))]";
const OVERLAY_CLASS =
  "[background-color:var(--pb-overlay)] dark:[background-color:var(--pb-overlay-dark,var(--pb-overlay))]";

function resolveBackgroundLayerStyle(background: SectionBackground): CssVars {
  const attachment = background.backgroundAttachment || "scroll";

  if (background.type === "color") {
    return {
      "--pb-bg": background.backgroundColor,
      "--pb-bg-dark": background.backgroundColorDark,
    };
  }

  if (background.type === "image") {
    const bgUrl = getMediaUrl(background.media);
    return {
      backgroundImage: bgUrl ? `url(${bgUrl})` : undefined,
      backgroundSize: background.backgroundSize || "cover",
      backgroundPosition: background.backgroundPosition || "center",
      backgroundRepeat: background.backgroundRepeat || "no-repeat",
      backgroundAttachment: attachment,
      maskImage: background.maskImage,
      WebkitMaskImage: background.maskImage,
    };
  }

  // Pattern / gradient
  return {
    "--pb-bg-image": background.backgroundImage,
    "--pb-bg-image-dark": background.backgroundImageDark,
    backgroundSize: background.gradientBackgroundSize || "cover",
    backgroundPosition: background.gradientBackgroundPosition || "center",
    backgroundRepeat: background.gradientBackgroundRepeat || "no-repeat",
    backgroundAttachment: attachment,
    maskImage: background.gradientMaskImage,
    WebkitMaskImage: background.gradientMaskImage,
  };
}

export const Section: React.FC<SectionProps> = ({
  children,
  className = "",
  theme,
  background,
  nextTheme: _nextTheme,
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
          {background && (
            <div
              aria-hidden
              className={cn(
                "pointer-events-none absolute inset-0 z-0",
                background.type === "color" && COLOR_LAYER_CLASS,
                background.type === "gradient" && GRADIENT_LAYER_CLASS,
              )}
              style={resolveBackgroundLayerStyle(background)}
            />
          )}
          {background && background.type === "image" && (
            <div
              aria-hidden
              className={cn(
                "pointer-events-none absolute inset-0 z-[1]",
                OVERLAY_CLASS,
              )}
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
