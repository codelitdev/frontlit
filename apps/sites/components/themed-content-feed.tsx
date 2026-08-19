"use client";

import Link from "next/link";
import { TextRenderer, type TextEditorContent } from "@frontlit/text-editor";
import {
    Badge,
    Caption,
    Header1,
    Header4,
    Subheader1,
    Text2,
} from "@frontlit/page-builder/primitives";
import { useSiteThemeStyle } from "@/lib/site-theme-context";

function FeedHeading({
    title,
    subtitle,
}: {
    title: string;
    subtitle?: string | null;
}) {
    const theme = useSiteThemeStyle();
    return (
        <header className="flex flex-col gap-4">
            <Header1 theme={theme}>{title}</Header1>
            {subtitle ? (
                <Subheader1 theme={theme} component="span">
                    {subtitle}
                </Subheader1>
            ) : null}
        </header>
    );
}

function formatDate(value: string) {
    return new Date(value).toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
    });
}

export function ThemedArticleFeed({
    title,
    subtitle,
    items,
}: {
    title: string;
    subtitle?: string | null;
    items: Array<{
        documentId: string;
        slug: string;
        title: string | null;
        excerpt: string | null;
        publishedAt: string | null;
    }>;
}) {
    const theme = useSiteThemeStyle();
    return (
        <div className="flex flex-col gap-10">
            <FeedHeading title={title} subtitle={subtitle} />
            {items.length === 0 ? (
                <Text2 theme={theme}>No articles published yet.</Text2>
            ) : (
                <ul className="flex flex-col gap-8">
                    {items.map((post) => (
                        <li key={post.documentId}>
                            <Link
                                href={`/blog/${post.slug}`}
                                className="group flex flex-col gap-2"
                            >
                                <Header4
                                    theme={theme}
                                    className="group-hover:underline"
                                >
                                    {post.title}
                                </Header4>
                                {post.excerpt && (
                                    <Text2 theme={theme}>{post.excerpt}</Text2>
                                )}
                                {post.publishedAt && (
                                    <Caption theme={theme}>
                                        <time dateTime={post.publishedAt}>
                                            {formatDate(post.publishedAt)}
                                        </time>
                                    </Caption>
                                )}
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

const LABEL_VARIANT: Record<
    string,
    "default" | "secondary" | "destructive" | "outline"
> = {
    added: "default",
    fixed: "secondary",
    improved: "outline",
    removed: "destructive",
};

export function ThemedProductUpdatesFeed({
    title,
    subtitle,
    jsonLd,
    items,
}: {
    title: string;
    subtitle?: string | null;
    jsonLd: string;
    items: Array<{
        documentId: string;
        title: string | null;
        content: TextEditorContent | null;
        publishedAt: string | null;
        meta: { version?: string | null; labels: string[] };
    }>;
}) {
    const theme = useSiteThemeStyle();
    return (
        <div className="flex flex-col gap-10">
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: jsonLd }}
            />
            <FeedHeading title={title} subtitle={subtitle} />
            {items.length === 0 ? (
                <Text2 theme={theme}>No changelog entries published yet.</Text2>
            ) : (
                <ol className="flex flex-col gap-12 border-l border-border pl-8">
                    {items.map((entry) => (
                        <li key={entry.documentId} className="relative">
                            <span className="absolute -left-[calc(2rem+5px)] top-1.5 h-2.5 w-2.5 rounded-full bg-muted-foreground" />
                            <div className="flex flex-wrap items-center gap-2">
                                {entry.meta.version && (
                                    <Caption theme={theme}>
                                        {entry.meta.version}
                                    </Caption>
                                )}
                                {entry.publishedAt && (
                                    <Caption theme={theme}>
                                        <time dateTime={entry.publishedAt}>
                                            {formatDate(entry.publishedAt)}
                                        </time>
                                    </Caption>
                                )}
                                {entry.meta.labels.map((label) => (
                                    <Badge
                                        key={label}
                                        theme={theme}
                                        variant={
                                            LABEL_VARIANT[label] ?? "secondary"
                                        }
                                    >
                                        {label}
                                    </Badge>
                                ))}
                            </div>
                            <Header4 theme={theme} className="mt-2">
                                {entry.title}
                            </Header4>
                            {entry.content && (
                                <div className="mt-3">
                                    <TextRenderer
                                        json={entry.content}
                                        theme={theme}
                                    />
                                </div>
                            )}
                        </li>
                    ))}
                </ol>
            )}
        </div>
    );
}
