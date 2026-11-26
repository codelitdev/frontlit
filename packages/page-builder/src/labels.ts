/**
 * Built-in text of the rendered page: controls of blocks, primitives and
 * components that learners and visitors see (not the builder). Pass a partial
 * set as `labels` to translate it; the rest stays English. Text with a value
 * in it is a function, so any translator can be used.
 *
 * Server-safe: no React context here (blocks render as server components).
 */
export type PageBuilderLabels = {
  /** Theme toggle while the light palette is painted. */
  switchToDarkMode: string;
  /** Theme toggle while the dark palette is painted. */
  switchToLightMode: string;
  /** Screen-reader text of the header's mobile menu button. */
  toggleMenu: string;
  /** Screen-reader text of the close button of dialogs, drawers and the video modal. */
  close: string;
  /** Screen-reader text of the header's GitHub link. */
  githubRepository: string;
  /** Badge of a highlighted pricing plan. */
  mostPopular: string;
  /** Pricing period switch, unless the block sets its own caption. */
  monthly: string;
  yearly: string;
  /** Accessible title of an embedded URL. */
  embeddedContent: string;
  /** Code snippet copy button, after copying. */
  copied: string;
  /** Code snippet copy button's accessible name. */
  copyToClipboard: string;
  /** Code snippet copy button's tooltip. */
  copy: string;
  /** Alt text of a video's thumbnail; `title` may be empty. */
  videoThumbnailAlt: (title: string) => string;
  /** Shown by browsers that can't play a self-hosted video. */
  videoNotSupported: string;
};

export const defaultPageBuilderLabels: PageBuilderLabels = {
  switchToDarkMode: "Switch to dark mode",
  switchToLightMode: "Switch to light mode",
  toggleMenu: "Toggle menu",
  close: "Close",
  githubRepository: "GitHub repository",
  mostPopular: "Most popular",
  monthly: "Monthly",
  yearly: "Yearly",
  embeddedContent: "Embedded content",
  copied: "Copied",
  copyToClipboard: "Copy to clipboard",
  copy: "Copy",
  videoThumbnailAlt: (title) => `Thumbnail for ${title}`,
  videoNotSupported: "Your browser does not support the video tag.",
};

/**
 * Lays each set of labels over the previous one, starting from the English
 * defaults. `undefined` entries are ignored.
 */
export function resolvePageBuilderLabels(
  ...layers: (Partial<PageBuilderLabels> | null | undefined)[]
): PageBuilderLabels {
  const present = layers.filter(Boolean) as Partial<PageBuilderLabels>[];
  if (!present.length) return defaultPageBuilderLabels;
  const resolved = { ...defaultPageBuilderLabels };
  for (const layer of present) {
    for (const [key, value] of Object.entries(layer)) {
      if (value !== undefined) (resolved as Record<string, unknown>)[key] = value;
    }
  }
  return resolved;
}

/**
 * The string labels `keys` of `labels`, for a client island (whose props must
 * be serialisable), or `undefined` when no labels were given.
 */
export function pickLabels<K extends keyof PageBuilderLabels>(
  labels: PageBuilderLabels | undefined,
  keys: readonly K[],
): Pick<PageBuilderLabels, K> | undefined {
  if (!labels) return undefined;
  return Object.fromEntries(keys.map((key) => [key, labels[key]])) as Pick<
    PageBuilderLabels,
    K
  >;
}
