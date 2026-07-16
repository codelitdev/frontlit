import React from "react";
import { cn } from "./lib/utils";
import type { SectionBackground, ThemeStyle } from "../models";

interface SectionProps extends React.HTMLAttributes<HTMLElement> {
    children: React.ReactNode;
    className?: string;
    theme?: ThemeStyle;
    component?: "header" | "footer" | "section";
    background?: SectionBackground;
    nextTheme?: "dark" | "light";
}

function resolveBackgroundLayerStyle(
    background: SectionBackground,
    nextTheme?: "dark" | "light",
): React.CSSProperties {
    const isDark = nextTheme === "dark";
    const attachment = background.backgroundAttachment || "scroll";

    if (background.type === "color") {
        return {
            backgroundColor: isDark
                ? background.backgroundColorDark || background.backgroundColor
                : background.backgroundColor,
        };
    }

    if (background.type === "image") {
        return {
            backgroundImage: background.media?.file
                ? `url(${background.media.file})`
                : undefined,
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
        backgroundImage: isDark
            ? background.backgroundImageDark || background.backgroundImage
            : background.backgroundImage,
        backgroundSize: background.gradientBackgroundSize || "cover",
        backgroundPosition:
            background.gradientBackgroundPosition || "center",
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
    nextTheme,
    component = "section",
    ...props
}) => {
    const classes = cn("bg-background text-foreground relative", className);
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
                            suppressHydrationWarning
                            aria-hidden
                            className="pointer-events-none absolute inset-0 z-0"
                            style={resolveBackgroundLayerStyle(
                                background,
                                nextTheme,
                            )}
                        />
                    )}
                    {background && background.type === "image" && (
                        <div
                            aria-hidden
                            className="pointer-events-none absolute inset-0 z-[1]"
                            style={{
                                backgroundColor:
                                    nextTheme === "dark"
                                        ? background?.overlay?.colorDark ||
                                          background?.overlay?.color
                                        : background?.overlay?.color,
                                opacity: background?.overlay?.opacity
                                    ? background.overlay.opacity / 10
                                    : 0,
                                mixBlendMode: background?.overlay?.blendMode,
                            }}
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
