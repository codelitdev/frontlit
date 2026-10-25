"use client";

import { SiteLink as NextLink } from "@/components/site-link";
import {
  PageBuilderLinkProvider,
  type PageBuilderLinkProps,
} from "@frontlit/page-builder/islands/nav-link";
import type { Theme } from "@frontlit/page-builder/models";
import { SiteThemeProvider } from "@/lib/site-theme-context";

function SiteLink(props: PageBuilderLinkProps) {
  return <NextLink {...props} />;
}

/**
 * Client context a server-rendered page needs: the theme for built-in
 * content, and Next.js `Link` for page-builder links. Functions can't cross
 * from a server component, hence this wrapper.
 */
export function SiteProviders({
  theme,
  children,
}: {
  theme: Theme;
  children: React.ReactNode;
}) {
  return (
    <SiteThemeProvider theme={theme}>
      <PageBuilderLinkProvider component={SiteLink}>{children}</PageBuilderLinkProvider>
    </SiteThemeProvider>
  );
}
