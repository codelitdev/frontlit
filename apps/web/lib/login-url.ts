type LoginUrlInput = {
    apiPublicUrl: string;
    webClient: string;
    next?: string;
};

/** Browser path to start hosted login while returning to `next` after. */
export function clientLoginPath(next?: string): string {
    if (
        next &&
        next.startsWith("/") &&
        !next.startsWith("//") &&
        !next.startsWith("/login")
    ) {
        return `/login?next=${encodeURIComponent(next)}`;
    }
    return "/login";
}

export function getWebLoginUrl({
    apiPublicUrl,
    webClient,
    next,
}: LoginUrlInput): string {
    const destination =
        next && next.startsWith("/") && !next.startsWith("//")
            ? `${webClient}${next}`
            : `${webClient}/`;
    return `${apiPublicUrl}/login?redirect=${encodeURIComponent(destination)}`;
}
