import type { PublicSettings } from "./api";

export interface SeoInput {
    /** Page/entity title override, description override, image, robots —
     * whichever the specific route has (architecture.md §12.3). */
    title?: string | null;
    description?: string | null;
    image?: Record<string, unknown> | null;
    robotsAllowed?: boolean | null;
    /** Fallback name used when nothing more specific is set (a page's
     * `name`, or absent for document-backed routes). */
    fallbackName?: string | null;
}

export interface ResolvedSeo {
    title: string;
    description: string | null;
    imageUrl: string | null;
    robotsIndex: boolean;
}

function mediaUrl(
    media: Record<string, unknown> | null | undefined,
): string | null {
    if (!media) return null;
    const url = media.url;
    return typeof url === "string" ? url : null;
}

/**
 * CourseLit-style fallback chains (architecture.md §12.3): title = page
 * title → entity title → page name → site title; image = page/entity image
 * → team logo; description = page/entity description → site subtitle.
 * Robots defaults to indexable unless explicitly disallowed.
 */
export function resolveSeo(
    entry: SeoInput,
    site: PublicSettings | null,
    siteName: string,
): ResolvedSeo {
    const title = entry.title || entry.fallbackName || site?.title || siteName;
    const description = entry.description || site?.subtitle || null;
    const imageUrl = mediaUrl(entry.image) ?? mediaUrl(site?.logo) ?? null;
    const robotsIndex = entry.robotsAllowed !== false;

    return { title, description, imageUrl, robotsIndex };
}

/** `<title>` template suffix — every route composes with this via Next's
 * `generateMetadata` `parent` chaining. */
export function titleTemplate(
    site: PublicSettings | null,
    siteName: string,
): string {
    return site?.title || siteName;
}
