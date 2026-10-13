import type React from "react";
import type { ThemeStyle } from "../models";

export interface TypographyProps extends React.HTMLAttributes<HTMLElement> {
  children: React.ReactNode;
  className?: string;
  theme?: ThemeStyle;
}
