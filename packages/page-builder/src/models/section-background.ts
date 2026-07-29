export type BlendMode =
    | "normal"
    | "multiply"
    | "screen"
    | "overlay"
    | "darken"
    | "lighten"
    | "color-dodge"
    | "color-burn"
    | "hard-light"
    | "soft-light"
    | "difference"
    | "exclusion"
    | "hue"
    | "saturation"
    | "color"
    | "luminosity";

export type BackgroundRepeat =
    "no-repeat" | "repeat" | "repeat-x" | "repeat-y" | "space" | "round";

/**
 * CSS `background-attachment`.
 * - `scroll` (default): background moves with the section / page
 * - `fixed`: background is pinned to the viewport so content scrolls
 *   over a static surface (classic parallax / “hero still” look)
 * - `local`: background scrolls with the element’s own overflow
 */
export type BackgroundAttachment = "scroll" | "fixed" | "local";

export interface SectionBackgroundOverlay {
    color: string;
    colorDark?: string;
    blendMode: BlendMode;
    opacity: number;
}

export type SectionBackground = {
    type: "color" | "image" | "gradient";
    backgroundColor?: string;
    backgroundColorDark?: string;
    backgroundImage?: string;
    backgroundImageDark?: string;
    backgroundSize?: string;
    backgroundPosition?: string;
    backgroundRepeat?: BackgroundRepeat;
    /**
     * When `"fixed"`, the image/pattern stays still relative to the
     * viewport while the page scrolls. Most useful on image and pattern
     * (gradient) backgrounds; ignored for solid color fills.
     */
    backgroundAttachment?: BackgroundAttachment;
    maskImage?: string;
    gradientBackgroundSize?: string;
    gradientBackgroundPosition?: string;
    gradientBackgroundRepeat?: BackgroundRepeat;
    gradientMaskImage?: string;
    blur?: number;
    overlay?: SectionBackgroundOverlay;
    media?: Record<string, unknown>;
};
