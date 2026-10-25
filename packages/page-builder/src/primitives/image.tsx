import type React from "react";
import type { ThemeStyle } from "../models";
import { resolveImageAttributes } from "../components/image";
import { cn } from "./lib/utils";

export interface ImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  alt?: string;
  className?: string;
  theme?: ThemeStyle;
  /** Above-the-fold image (e.g. LCP): fetched eagerly at high priority. */
  priority?: boolean;
}

export const Image: React.FC<ImageProps> = ({
  src,
  alt = "",
  className = "",
  theme,
  priority = false,
  sizes,
  ...props
}) => {
  const cardStyles = theme?.interactives?.card;
  const classes = cn("w-full object-cover", cardStyles?.border?.radius, className);
  // The host's optimizer (if registered) serves a resized, modern-format copy.
  const optimized = resolveImageAttributes({ src, alt, sizes, priority });

  return (
    <img
      src={src}
      alt={alt}
      sizes={sizes}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      fetchPriority={priority ? "high" : undefined}
      className={classes}
      {...props}
      {...optimized}
    />
  );
};
