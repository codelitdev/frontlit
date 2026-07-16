/** Typed builders for the `<script type="application/ld+json">` blocks
 * (architecture.md §12.3). Each returns a plain schema.org object; the
 * component that renders it is responsible for escaping `<` to `<`
 * before serializing, to prevent script injection from user-authored
 * titles. */

export function organizationAndWebsiteJsonLd(input: { siteName: string; logoUrl: string | null; primaryHost: string }) {
    const url = `https://${input.primaryHost}`;
    return [
        {
            "@context": "https://schema.org",
            "@type": "Organization",
            name: input.siteName,
            url,
            ...(input.logoUrl ? { logo: input.logoUrl } : {}),
        },
        {
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: input.siteName,
            url,
        },
    ];
}

export function blogPostingJsonLd(input: {
    title: string;
    excerpt: string | null;
    imageUrl: string | null;
    publishedAt: string | null;
    updatedAt: string | null;
    authorName: string | null;
    url: string;
}) {
    return {
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        headline: input.title,
        description: input.excerpt ?? undefined,
        image: input.imageUrl ?? undefined,
        datePublished: input.publishedAt ?? undefined,
        dateModified: input.updatedAt ?? input.publishedAt ?? undefined,
        author: input.authorName ? { "@type": "Person", name: input.authorName } : undefined,
        mainEntityOfPage: input.url,
    };
}

export function techArticleJsonLd(input: {
    title: string;
    excerpt: string | null;
    publishedAt: string | null;
    updatedAt: string | null;
    url: string;
    breadcrumb: { name: string; url: string }[];
}) {
    return [
        {
            "@context": "https://schema.org",
            "@type": "TechArticle",
            headline: input.title,
            description: input.excerpt ?? undefined,
            datePublished: input.publishedAt ?? undefined,
            dateModified: input.updatedAt ?? input.publishedAt ?? undefined,
            mainEntityOfPage: input.url,
        },
        {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: input.breadcrumb.map((item, index) => ({
                "@type": "ListItem",
                position: index + 1,
                name: item.name,
                item: item.url,
            })),
        },
    ];
}

export function changelogJsonLd(input: { siteName: string; url: string; entries: { name: string; url: string }[] }) {
    return {
        "@context": "https://schema.org",
        "@type": "WebPage",
        name: `${input.siteName} changelog`,
        url: input.url,
        mainEntity: {
            "@type": "ItemList",
            itemListElement: input.entries.map((entry, index) => ({
                "@type": "ListItem",
                position: index + 1,
                name: entry.name,
                url: entry.url,
            })),
        },
    };
}

/** Serializes for a `<script>` body, escaping `<` so a user-authored title
 * like `</script><script>...` can't break out of the JSON-LD block. */
export function serializeJsonLd(data: unknown): string {
    return JSON.stringify(data).replace(/</g, "\\u003c");
}
