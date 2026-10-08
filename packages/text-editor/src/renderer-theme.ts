/**
 * A loose, structural subset of a design system's theme — just enough for
 * `TextRenderer` to apply theme-aware typography to rendered headings,
 * paragraphs and links.
 *
 * This package intentionally has no dependency on `@frontlit/page-builder`
 * (that would create a circular dependency, since page-builder depends on
 * this package for editing/rendering). Any object shaped like this —
 * including page-builder's full `ThemeStyle` — is structurally assignable
 * here without either package needing to import the other's types.
 */
export interface RendererTypography {
  fontFamily?: string;
  fontSize?: string;
  fontWeight?: string;
  lineHeight?: string;
  letterSpacing?: string;
  textTransform?: string;
  textDecoration?: string;
  textOverflow?: string;
}

export interface RendererLinkInteractiveStyle {
  padding?: { x?: string; y?: string };
  border?: { width?: string; radius?: string; style?: string };
  textShadow?: string;
  custom?: string;
}

export interface TextRendererTheme {
  typography?: {
    header1?: RendererTypography;
    header2?: RendererTypography;
    header3?: RendererTypography;
    header4?: RendererTypography;
    text1?: RendererTypography;
    link?: RendererTypography;
  };
  interactives?: {
    link?: RendererLinkInteractiveStyle;
  };
}
