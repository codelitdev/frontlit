import type { WidgetDefaultSettings } from "../../models";

export interface HeaderNavLink {
  id: string;
  label: string;
  href: string;
  isButton?: boolean;
}

export interface HeaderSettings extends WidgetDefaultSettings {
  logoCorners?: number;
  links?: HeaderNavLink[];
  ctaLabel?: string;
  ctaHref?: string;
  linkAlignment?: "left" | "center" | "right";
  layout?: "fixed" | "floating" | "centered";
  backdropBlur?: boolean;
  /** `owner/repo` (or a github.com URL). Shows a GitHub icon link. */
  githubRepo?: string;
  showGithubStars?: boolean;
}
