/** Branding fields every page-builder host passes in `pageData`. Header and
 * footer render exactly these; an unset one renders nothing. */
export interface SiteBranding {
  siteTitle: string | null;
  siteSubtitle: string | null;
  siteLogoUrl: string | null;
  siteLogoAlt: string | null;
}

/** The one mapping from Branding settings to page-builder `pageData`. Pass
 * `null` when the viewer can't read settings. */
export function toSiteBranding(
  settings: {
    title?: string | null;
    subtitle?: string | null;
    logo?: Record<string, unknown> | null;
  } | null,
): SiteBranding {
  const logo = settings?.logo;
  return {
    siteTitle: settings?.title || null,
    siteSubtitle: settings?.subtitle || null,
    siteLogoUrl: typeof logo?.url === "string" ? logo.url : null,
    siteLogoAlt:
      typeof logo?.alt === "string"
        ? logo.alt
        : typeof logo?.caption === "string"
          ? logo.caption
          : null,
  };
}
