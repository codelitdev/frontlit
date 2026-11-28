import type { Metadata } from "next";
import type { PublicPage, PublicSettings } from "./api";

export interface SeoInput {
  /** Page/entity title override, description override, image, robots —
   * whichever the specific route has (architecture.md §12.3). */
  title?: string | null;
  description?: string | null;
  image?: unknown;
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

function mediaUrl(media: unknown): string | null {
  if (!media) return null;
  if (typeof media === "string") return media;
  if (typeof media === "object") {
    const obj = media as Record<string, unknown>;
    const url = obj.url ?? obj.file ?? obj.src;
    return typeof url === "string" ? url : null;
  }
  return null;
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
export function titleTemplate(site: PublicSettings | null, siteName: string): string {
  return site?.title || siteName;
}

/**
 * Metadata for a route backed by a page record: a builder/Git page, or a
 * standard feed index (/blog, /docs, /changelog), whose page record carries
 * the listing's SEO. `robotsAllowed: false` on the page, or a site hidden from
 * search, renders noindex. `page` is null when the feed index has no
 * published page; `fallbackName` names it then.
 */
export function pageMetadata({
  page,
  settings,
  siteName,
  url,
  fallbackName,
}: {
  page: Pick<
    PublicPage,
    "slug" | "name" | "title" | "description" | "socialImage" | "robotsAllowed"
  > | null;
  settings: PublicSettings | null;
  siteName: string;
  url: string;
  fallbackName?: string;
}): Metadata {
  const isHomepage = page?.slug === "";
  const seo = resolveSeo(
    {
      title: page?.title,
      description: page?.description,
      image: page?.socialImage,
      robotsAllowed: page?.robotsAllowed,
      // The homepage falls back to the site title, not "Homepage".
      fallbackName: isHomepage ? undefined : (page?.name ?? fallbackName),
    },
    settings,
    siteName,
  );
  const index = seo.robotsIndex && !settings?.hideFromSearch;
  return {
    // The layout's template appends the site title; the homepage is the
    // site itself, so its title stands alone.
    title: isHomepage ? { absolute: seo.title } : seo.title,
    description: seo.description ?? undefined,
    alternates: { canonical: url },
    openGraph: {
      url,
      type: "website",
      title: seo.title,
      description: seo.description ?? undefined,
      images: seo.imageUrl ? [{ url: seo.imageUrl }] : undefined,
    },
    robots: { index, follow: index },
  };
}
