import Link from "next/link";
import { TextRenderer } from "@frontlit/text-editor";
import type { DataSlotLoader } from "@frontlit/page-builder/data-slots";
import {
    getSettings,
    listArticles,
    listProductUpdates,
    listDocumentationSections,
    listDocumentation,
} from "@/lib/api";
import { getCanonicalHost } from "@/lib/request-host";
import { changelogJsonLd, serializeJsonLd } from "@/lib/json-ld";

export const CONTENT_FEED_SOURCES = [
    "articles",
    "documentation",
    "product-updates",
] as const;
export type ContentFeedSource = (typeof CONTENT_FEED_SOURCES)[number];

/** Name stored by FrontLit's standard content pages in the generic data slot. */
export const FRONTLIT_CONTENT_FEED_SLOT = "frontlit.content-feed";

export function isContentFeedSource(
    value: unknown,
): value is ContentFeedSource {
    return CONTENT_FEED_SOURCES.includes(value as ContentFeedSource);
}

async function ArticleFeed({ teamId }: { teamId: string }) {
    const [settings, { items }] = await Promise.all([
        getSettings(teamId),
        listArticles(teamId, { itemsPerPage: 50 }),
    ]);

    return (
        <main className="mx-auto max-w-3xl px-6 py-16">
            <h1 className="text-3xl font-bold">
                {settings?.title ? `${settings.title} Blog` : "Blog"}
            </h1>
            <ul className="mt-10 flex flex-col gap-8">
                {items.map((post) => (
                    <li key={post.documentId}>
                        <Link
                            href={`/blog/${post.slug}`}
                            className="group block"
                        >
                            <h2 className="text-xl font-semibold group-hover:underline">
                                {post.title}
                            </h2>
                            {post.excerpt && (
                                <p className="mt-2 text-muted-foreground">
                                    {post.excerpt}
                                </p>
                            )}
                            {post.publishedAt && (
                                <time
                                    dateTime={post.publishedAt}
                                    className="mt-2 block text-sm text-muted-foreground"
                                >
                                    {new Date(
                                        post.publishedAt,
                                    ).toLocaleDateString(undefined, {
                                        year: "numeric",
                                        month: "long",
                                        day: "numeric",
                                    })}
                                </time>
                            )}
                        </Link>
                    </li>
                ))}
                {items.length === 0 && (
                    <p className="text-muted-foreground">
                        No articles published yet.
                    </p>
                )}
            </ul>
        </main>
    );
}

async function DocumentationFeed({ teamId }: { teamId: string }) {
    const [sections, { items }] = await Promise.all([
        listDocumentationSections(teamId),
        listDocumentation(teamId, { itemsPerPage: 500 }),
    ]);
    const bySection = new Map<string, typeof items>();
    const unsectioned: typeof items = [];
    for (const doc of items) {
        const sectionId = doc.meta.sectionId;
        if (!sectionId) {
            unsectioned.push(doc);
            continue;
        }
        if (!bySection.has(sectionId)) bySection.set(sectionId, []);
        bySection.get(sectionId)!.push(doc);
    }
    for (const docs of bySection.values()) {
        docs.sort((a, b) => (a.meta.order ?? 0) - (b.meta.order ?? 0));
    }

    return (
        <main className="mx-auto max-w-5xl px-6 py-16">
            <h1 className="text-3xl font-bold">Documentation</h1>
            <div className="mt-10 grid gap-10 sm:grid-cols-2">
                {sections.map((section) => (
                    <div key={section.sectionId}>
                        <h2 className="text-lg font-semibold">
                            {section.name}
                        </h2>
                        <ul className="mt-3 flex flex-col gap-2">
                            {(bySection.get(section.sectionId) ?? []).map(
                                (doc) => (
                                    <li key={doc.documentId}>
                                        <Link
                                            href={`/docs/${doc.slug}`}
                                            className="text-foreground/80 hover:text-foreground hover:underline"
                                        >
                                            {doc.title}
                                        </Link>
                                    </li>
                                ),
                            )}
                        </ul>
                    </div>
                ))}
                {unsectioned.length > 0 && (
                    <div>
                        <h2 className="text-lg font-semibold">More</h2>
                        <ul className="mt-3 flex flex-col gap-2">
                            {unsectioned.map((doc) => (
                                <li key={doc.documentId}>
                                    <Link
                                        href={`/docs/${doc.slug}`}
                                        className="text-foreground/80 hover:text-foreground hover:underline"
                                    >
                                        {doc.title}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>
            {items.length === 0 && (
                <p className="mt-10 text-muted-foreground">
                    No documentation published yet.
                </p>
            )}
        </main>
    );
}

const LABEL_CLASS: Record<string, string> = {
    added: "bg-emerald-100 text-emerald-700",
    fixed: "bg-amber-100 text-amber-700",
    improved: "bg-sky-100 text-sky-700",
    removed: "bg-rose-100 text-rose-700",
};

async function ProductUpdatesFeed({ teamId }: { teamId: string }) {
    const [settings, { items }, canonicalHost] = await Promise.all([
        getSettings(teamId),
        listProductUpdates(teamId, { itemsPerPage: 100 }),
        getCanonicalHost(),
    ]);

    return (
        <main className="mx-auto max-w-3xl px-6 py-16">
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{
                    __html: serializeJsonLd(
                        changelogJsonLd({
                            siteName: settings?.title || "FrontLit site",
                            url: `https://${canonicalHost}/changelog`,
                            entries: items.map((entry) => ({
                                name: entry.title ?? entry.slug,
                                url: `https://${canonicalHost}/changelog`,
                            })),
                        }),
                    ),
                }}
            />
            <h1 className="text-3xl font-bold">Product updates</h1>
            <ol className="mt-10 flex flex-col gap-12 border-l border-border pl-8">
                {items.map((entry) => (
                    <li key={entry.documentId} className="relative">
                        <span className="absolute -left-[calc(2rem+5px)] top-1.5 h-2.5 w-2.5 rounded-full bg-muted-foreground" />
                        <div className="flex flex-wrap items-center gap-2">
                            {entry.meta.version && (
                                <span className="font-mono text-sm text-muted-foreground">
                                    {entry.meta.version}
                                </span>
                            )}
                            {entry.publishedAt && (
                                <time
                                    dateTime={entry.publishedAt}
                                    className="text-sm text-muted-foreground"
                                >
                                    {new Date(
                                        entry.publishedAt,
                                    ).toLocaleDateString(undefined, {
                                        year: "numeric",
                                        month: "long",
                                        day: "numeric",
                                    })}
                                </time>
                            )}
                            {entry.meta.labels.map((label) => (
                                <span
                                    key={label}
                                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${LABEL_CLASS[label] ?? "bg-muted text-muted-foreground"}`}
                                >
                                    {label}
                                </span>
                            ))}
                        </div>
                        <h2 className="mt-2 text-xl font-semibold">
                            {entry.title}
                        </h2>
                        {entry.content && (
                            <div className="prose mt-3 max-w-none">
                                <TextRenderer json={entry.content} />
                            </div>
                        )}
                    </li>
                ))}
                {items.length === 0 && (
                    <p className="text-muted-foreground">
                        No product updates published yet.
                    </p>
                )}
            </ol>
        </main>
    );
}

export function ContentFeed({
    teamId,
    source,
}: {
    teamId: string;
    source: ContentFeedSource;
}) {
    if (source === "articles") return <ArticleFeed teamId={teamId} />;
    if (source === "documentation") {
        return <DocumentationFeed teamId={teamId} />;
    }
    return <ProductUpdatesFeed teamId={teamId} />;
}

/**
 * FrontLit's application-owned implementation of the page-builder data-slot
 * contract. Other applications can provide different loaders for their own
 * slot names without importing FrontLit's content model.
 */
export const frontlitContentFeedLoader: DataSlotLoader = ({
    instance,
    pageData,
}) => {
    const source = instance.settings?.source;
    if (!pageData.teamId || !isContentFeedSource(source)) return null;
    return <ContentFeed teamId={pageData.teamId} source={source} />;
};
