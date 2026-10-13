import type React from "react";
import type { ThemeStyle } from "../models";
import { cn } from "./lib/utils";

export interface ImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  alt?: string;
  className?: string;
  theme?: ThemeStyle;
}

export const Image: React.FC<ImageProps> = ({
  src,
  alt = "",
  className = "",
  theme,
  ...props
}) => {
  const cardStyles = theme?.interactives?.card;
  const classes = cn("w-full object-cover", cardStyles?.border?.radius, className);

  return <img src={src} alt={alt} className={classes} {...props} />;
};
