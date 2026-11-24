import type { WidgetDefaultSettings } from "../../models";

export interface FooterLink {
  id: string;
  label: string;
  href: string;
}

export interface FooterColumn {
  id: string;
  title: string;
  links: FooterLink[];
}

/** Profile URLs keyed by platform; an empty one renders no icon. */
export interface FooterSocials {
  facebook?: string;
  twitter?: string;
  instagram?: string;
  linkedin?: string;
  youtube?: string;
  discord?: string;
  github?: string;
}

export interface FooterSettings extends WidgetDefaultSettings {
  /** Show the Branding logo image next to the site title. */
  showLogo?: boolean;
  tagline?: string;
  socials?: FooterSocials;
  columns?: FooterColumn[];
  copyrightText?: string;
  layout?: "columns" | "centered" | "minimal";
  showThemeSwitcher?: boolean;
}
