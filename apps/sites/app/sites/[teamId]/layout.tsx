import type { Metadata } from "next";
import { BUILD_TEAM_ID, getSettings } from "@/lib/api";
import { themeFontPreloads } from "@/lib/font-css";
import { loadSiteTheme } from "@/lib/load-site-theme";
import { resolveSiteTheme } from "@/lib/site-theme";

/**
 * Every tenant route is rendered from cached data and cached as a whole
 * (docs/site-delivery.md §4). Nothing under here reads request headers or
 * cookies, so one response per host and path is safe to share. Teams aren't
 * known at build time: the placeholder satisfies Cache Components, and real
 * teams render on their first request.
 */
export function generateStaticParams() {
  return [{ teamId: BUILD_TEAM_ID }];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ teamId: string }>;
}): Promise<Metadata> {
  const { teamId } = await params;
  const settings = await getSettings(teamId);
  const siteTitle = settings?.title || "Website";
  const logoUrl = (settings?.logo?.url as string | undefined) ?? null;

  return {
    title: { template: `%s | ${siteTitle}`, default: siteTitle },
    description: settings?.subtitle ?? undefined,
    icons: logoUrl ? { icon: logoUrl } : undefined,
    // Pages that set their own robots repeat this check (child metadata
    // wins). A non-canonical host gets `X-Robots-Tag` from the proxy.
    robots: settings?.hideFromSearch ? { index: false, follow: false } : undefined,
    openGraph: {
      type: "website",
      siteName: siteTitle,
      images: logoUrl ? [{ url: logoUrl }] : undefined,
    },
  };
}

export default async function TenantLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;
  const siteTheme = await loadSiteTheme(teamId);

  // Only the fonts the active theme paints with are preloaded. Rendered as
  // tags, not `preload()` from react-dom: the root layout's <head> has gone
  // out before this layout runs, and a late `preload()` only reaches the RSC
  // payload, which the browser acts on after the scripts run. A `<link>` is
  // hoisted into the head or, failing that, written into the HTML stream.
  const { theme } = resolveSiteTheme(siteTheme.themeId, siteTheme.themeStyle);
  return (
    <>
      {themeFontPreloads(theme).map((href) => (
        <link
          key={href}
          rel="preload"
          href={href}
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
      ))}
      {children}
    </>
  );
}
