import type { PageBuilderLinkProps } from "@frontlit/page-builder";

/**
 * Starter layouts use `/#features`-style hrefs. A native `<a href="/#…">`
 * drops the current query string, so rewrite those to in-page hashes.
 */
export function DemoLink({
  href,
  children,
  className,
  style,
  onClick,
  target,
  rel,
}: PageBuilderLinkProps) {
  const resolved = href.startsWith("/#") ? href.slice(1) : href;
  return (
    <a
      href={resolved}
      className={className}
      style={style}
      onClick={onClick}
      target={target}
      rel={rel}
    >
      {children}
    </a>
  );
}
