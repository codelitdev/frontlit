import type React from "react";
import { cn } from "../primitives/lib/utils";

export interface ImageAttributesInput {
  src: string;
  alt: string;
  sizes?: string;
  /** Above-the-fold image (e.g. LCP): fetched eagerly at high priority. */
  priority: boolean;
}

/**
 * Lets a host swap an image's `src`/`srcSet` for its own optimizer's URLs
 * (e.g. Next.js's `getImageProps`) without this package depending on the
 * host framework. Return `null` to keep the original URL.
 */
export type ImageAttributesResolver = (
  input: ImageAttributesInput,
) => React.ImgHTMLAttributes<HTMLImageElement> | null;

let imageAttributesResolver: ImageAttributesResolver | null = null;

/**
 * Registers the host's resolver. Call once at server start-up; renders that
 * run without one emit the original URL.
 */
export function setImageAttributesResolver(resolver: ImageAttributesResolver | null) {
  imageAttributesResolver = resolver;
}

export type ImageObjectFit = "cover" | "contain" | "fill" | "none" | "scale-down";

export const roundedMap: Record<number, string> = {
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

interface ImgProps {
  src: string;
  classes?: string;
  alt?: string;
  defaultImage?: string;
  loading?: "eager" | "lazy";
  /** Marks the image as likely LCP: eager load with high fetch priority. */
  priority?: boolean;
  height?: string;
  sizes?: string;
  width?: string;
  borderRadius?: number | string;
  noDefaultImage?: boolean;
  className?: string;
  objectFit?: ImageObjectFit;
}

const objectFitClass: Record<ImageObjectFit, string> = {
  cover: "object-cover",
  contain: "object-contain",
  fill: "object-fill",
  none: "object-none",
  "scale-down": "object-scale-down",
};

export const Image = (props: ImgProps) => {
  const {
    src,
    alt = "",
    defaultImage,
    priority = false,
    loading = priority ? "eager" : "lazy",
    sizes,
    noDefaultImage = false,
    className = "",
    classes = "",
    width = "w-full",
    height = "h-auto",
    objectFit = "cover",
    borderRadius,
  } = props;
  const source = src || defaultImage;

  const radiusClass =
    typeof borderRadius === "number"
      ? (roundedMap[borderRadius] ?? "rounded")
      : borderRadius;

  if (!source) {
    if (noDefaultImage) return null;
    return (
      <div
        className={cn(
          "relative aspect-video overflow-hidden bg-muted",
          width,
          height,
          radiusClass,
          classes,
          className,
        )}
      />
    );
  }

  const optimized = imageAttributesResolver?.({ src: source, alt, sizes, priority });

  return (
    <div
      className={cn(
        "relative aspect-video overflow-hidden",
        width,
        height,
        radiusClass,
        classes,
        className,
      )}
    >
      <img
        src={source}
        alt={alt}
        sizes={sizes}
        loading={loading}
        decoding="async"
        fetchPriority={priority ? "high" : undefined}
        {...optimized}
        className={cn(
          "absolute inset-0 h-full w-full",
          radiusClass,
          objectFitClass[objectFit],
        )}
      />
    </div>
  );
};
