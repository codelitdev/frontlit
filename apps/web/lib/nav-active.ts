function hrefQuery(href: string): string {
  const queryStart = href.indexOf("?");
  if (queryStart === -1) return "";
  return href.slice(queryStart + 1).split("#", 1)[0] ?? "";
}

/** Whether a sidebar href should appear active for the current pathname. */
export function isNavItemActive(pathname: string, href: string): boolean {
  const targetPathname = href.split(/[?#]/, 1)[0] || "/";
  // Root `/` must be exact — otherwise every path matches `startsWith("/")`.
  if (targetPathname === "/") return pathname === "/";
  return pathname === targetPathname || pathname.startsWith(`${targetPathname}/`);
}

/** Path match plus any query params on `href` (used for tabbed submenu items). */
export function isNavHrefActive(pathname: string, href: string, search = ""): boolean {
  if (!isNavItemActive(pathname, href)) return false;
  const requiredQuery = hrefQuery(href);
  if (!requiredQuery) return true;
  const required = new URLSearchParams(requiredQuery);
  const current = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search,
  );
  for (const [key, value] of required) {
    if (current.get(key) !== value) return false;
  }
  return true;
}
