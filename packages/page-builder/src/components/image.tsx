import { cn } from "../primitives/lib/utils";

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
  height?: string;
  sizes?: `${string}vw`;
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
    loading = "lazy",
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
        loading={loading}
        className={cn(
          "absolute inset-0 h-full w-full",
          radiusClass,
          objectFitClass[objectFit],
        )}
      />
    </div>
  );
};
