"use client";

import * as React from "react";

export interface PageBuilderLinkProps {
  href: string;
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  onClick?: React.MouseEventHandler<HTMLAnchorElement>;
  target?: string;
  rel?: string;
}

/**
 * Optional host-supplied link. Next.js apps can pass `next/link`; Vite / Remix
 * / plain React hosts can omit it and NavLink will render a native `<a>`.
 */
export type PageBuilderLinkComponent = React.ComponentType<PageBuilderLinkProps>;

const PageBuilderLinkContext = React.createContext<PageBuilderLinkComponent | null>(
  null,
);

export function PageBuilderLinkProvider({
  component,
  children,
}: {
  component?: PageBuilderLinkComponent | null;
  children: React.ReactNode;
}) {
  return (
    <PageBuilderLinkContext.Provider value={component ?? null}>
      {children}
    </PageBuilderLinkContext.Provider>
  );
}

export function usePageBuilderLinkComponent() {
  return React.useContext(PageBuilderLinkContext);
}

interface NavLinkProps {
  href: string;
  children?: React.ReactNode;
  openInSameTab?: boolean;
  style?: React.CSSProperties;
  className?: string;
  onClick?: () => void;
}

/**
 * A navigation-aware link used inside block widgets. In-page anchors scroll
 * to the target. Internal paths (`/...`) use the host `linkComponent` when
 * one is provided (e.g. Next.js `Link`); everything else is a native `<a>`.
 */
export function NavLink({
  href,
  children,
  openInSameTab = true,
  style,
  className = "",
  onClick,
}: NavLinkProps) {
  const LinkComponent = usePageBuilderLinkComponent();
  const isInternal = Boolean(href && href.startsWith("/"));
  const isInPageNavigation = Boolean(href && href.startsWith("#"));
  const target = openInSameTab ? undefined : "_blank";
  const rel = target === "_blank" ? "noopener noreferrer" : undefined;
  const handleClick: React.MouseEventHandler<HTMLAnchorElement> = () => {
    onClick?.();
  };

  if (!isInPageNavigation && isInternal && LinkComponent) {
    return (
      <LinkComponent
        href={href}
        style={style}
        className={className}
        onClick={handleClick}
        target={target}
        rel={rel}
      >
        {children}
      </LinkComponent>
    );
  }

  return (
    <a
      href={href}
      style={style}
      className={className}
      target={target}
      rel={rel}
      onClick={handleClick}
    >
      {children}
    </a>
  );
}
