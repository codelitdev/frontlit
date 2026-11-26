"use client";

import React, { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button, type ButtonProps } from "../primitives";
import { Button as ChromeButton } from "../primitives/components/ui/button";
import type { ThemeStyle } from "../models";
import type { ResolvedColorMode } from "../utils";
import type { PageBuilderLabels } from "../labels";
import { usePageBuilderLabels } from "./labels-provider";

/**
 * Light / dark toggle. Public sites pass `theme` so the button uses
 * page-builder primitives; the builder chrome omits it and matches the
 * other icon buttons in the top bar.
 *
 * Preference starts as system (OS). The first click pins an explicit
 * light or dark side; later clicks flip between those two.
 */
export function ThemeModeSwitcher({
  resolved,
  onToggle,
  theme,
  className,
  size,
  variant,
  labels: labelsProp,
}: {
  resolved: ResolvedColorMode;
  onToggle: () => void;
  theme?: ThemeStyle;
  className?: string;
  size?: ButtonProps["size"];
  variant?: ButtonProps["variant"];
  /** Translated toggle text; otherwise from `PageBuilderLabelsProvider`, then English. */
  labels?: Partial<Pick<PageBuilderLabels, "switchToDarkMode" | "switchToLightMode">>;
}) {
  const labels = usePageBuilderLabels(labelsProp);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  const painted = mounted ? resolved : "light";
  const next = painted === "dark" ? "light" : "dark";
  const label = next === "dark" ? labels.switchToDarkMode : labels.switchToLightMode;
  const Icon = painted === "dark" ? Sun : Moon;

  if (theme) {
    return (
      <Button
        type="button"
        variant={variant ?? "outline"}
        size={size ?? "sm"}
        theme={theme}
        title={label}
        aria-label={label}
        className={className}
        onClick={onToggle}
      >
        <Icon className="h-4 w-4" />
      </Button>
    );
  }

  return (
    <ChromeButton
      type="button"
      variant="outline"
      size="icon"
      title={label}
      aria-label={label}
      className={className}
      onClick={onToggle}
    >
      <Icon className="h-4 w-4" />
    </ChromeButton>
  );
}
