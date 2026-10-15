/** Heading element a block renders its title as. */
export type HeadingLevel = "h1" | "h2" | "h3";

/** Per-breakpoint text size in px; unset breakpoints keep the theme size. */
export interface ResponsiveTextSize {
  mobile?: number;
  tablet?: number;
  desktop?: number;
}

/** Title options shared by every block with a title. */
export interface TitleSettings {
  /** Defaults to H1 for the Hero and H2 everywhere else. */
  titleLevel?: HeadingLevel;
  titleSize?: ResponsiveTextSize;
}
