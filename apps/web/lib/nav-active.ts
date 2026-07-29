/** Whether a sidebar href should appear active for the current pathname. */
export function isNavItemActive(pathname: string, href: string): boolean {
    // Root `/` must be exact — otherwise every path matches `startsWith("/")`.
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(`${href}/`);
}
