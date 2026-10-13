import type React from "react";
import { cn } from "./lib/utils";
import type { TypographyProps } from "./typography";

export const Header1: React.FC<TypographyProps> = ({
  children,
  className = "",
  theme,
  ...props
}) => {
  const typographyStyles = theme?.typography?.header1;
  const classes = cn(
    // Base styles
    "scroll-m-20 text-4xl font-bold tracking-tight",
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
    <h1 className={classes} {...props}>
      {children}
    </h1>
  );
};
