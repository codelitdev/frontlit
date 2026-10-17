import { ServerPageRenderer } from "@frontlit/page-builder/server";
import type { PageData, WidgetInstance } from "@frontlit/page-builder/models";
import { resolveSiteTheme } from "@/lib/site-theme";
import { SiteProviders } from "@/components/site-providers";
import { SiteThemeSwitcher } from "@/components/site-theme-switcher";
import "@/lib/images";

/**
 * Renders a page on the server. Static blocks send no JavaScript; only the
 * interactive blocks (mobile menu, forms, marquee, copy buttons) are client
 * components. The team theme is resolved here, never in the browser.
 */
export function SitePageRenderer({
  layout,
  themeId,
  themeStyle,
  pageData,
  siteLogoUrl,
  siteLogoAlt,
  children,
  dataSlots,
}: {
  layout: WidgetInstance[];
  themeId: string | null;
  themeStyle: Record<string, unknown> | null;
  pageData: PageData;
  siteLogoUrl?: string | null;
  siteLogoAlt?: string | null;
  children?: React.ReactNode;
  dataSlots?: Record<string, React.ReactNode>;
}) {
  const theme = resolveSiteTheme(themeId, themeStyle);

  return (
    <SiteProviders theme={theme}>
      <ServerPageRenderer
        layout={layout}
        theme={theme}
        pageData={{
          ...pageData,
          ...(siteLogoUrl ? { siteLogoUrl } : {}),
          ...(siteLogoAlt ? { siteLogoAlt } : {}),
        }}
        dataSlots={dataSlots}
        themeSwitcher={<SiteThemeSwitcher />}
      >
        {children}
      </ServerPageRenderer>
    </SiteProviders>
  );
}
