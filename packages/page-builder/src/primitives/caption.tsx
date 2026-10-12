import type React from "react";
import { cn } from "./lib/utils";
import type { TypographyProps } from "./typography";

export const Caption: React.FC<TypographyProps> = ({
  children,
  className = "",
  theme,
  ...props
}) => {
  const typographyStyles = theme?.typography?.caption;
  const classes = cn(
    // Base styles
    "text-xs leading-7 text-muted-foreground",
    // Theme overrides
    typographyStyles?.fontFamily,
    typographyStyles?.fontSize,
    typographyStyles?.fontWeight,
    typographyStyles?.lineHeight,
    typographyStyles?.letterSpacing,
    typographyStyles?.textTransform,
    typographyStyles?.textDecoration,
    typographyStyles?.textOverflow,
    className,
  );

  return (
    <span className={classes} {...props}>
      {children}
    </span>
  );
};
