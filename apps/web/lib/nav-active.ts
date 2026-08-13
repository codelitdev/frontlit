/** Whether a sidebar href should appear active for the current pathname. */
export function isNavItemActive(pathname: string, href: string): boolean {
    const targetPathname = href.split(/[?#]/, 1)[0] || "/";
    // Root `/` must be exact — otherwise every path matches `startsWith("/")`.
    if (targetPathname === "/") return pathname === "/";
    return (
        pathname === targetPathname || pathname.startsWith(`${targetPathname}/`)
    );
}
