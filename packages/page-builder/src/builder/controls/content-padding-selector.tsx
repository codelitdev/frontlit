"use client";

import React from "react";
import { PageBuilderSlider } from "./page-builder-slider";

interface ContentPaddingProps {
  value: number;
  onChange: (padding?: number) => void;
  className?: string;
  min?: number;
  max?: number;
  variant?: "vertical" | "horizontal";
}

export function ContentPaddingSelector({
  value,
  onChange,
  className = "",
  variant = "horizontal",
  min,
  max,
}: ContentPaddingProps) {
  const tooltip =
    variant === "horizontal"
      ? "Width of the actual content. It affects only desktop class displays"
      : "Space on the top and bottom of the content. It affects only desktop class displays";

  const defaultMax = variant === "horizontal" ? 100 : 200;
  const defaultMin = variant === "horizontal" ? 10 : 16;

  return (
    <PageBuilderSlider
      title={variant === "horizontal" ? "Content width" : "Vertical padding"}
      max={max || defaultMax}
      min={min || defaultMin}
      onChange={onChange}
      value={value}
      tooltip={tooltip}
      className={className}
    />
  );
}
