"use client";

import { TextRenderer, type TextEditorContent } from "@frontlit/text-editor";
import { Caption, Header1, Section } from "@frontlit/page-builder/primitives";
import { useSiteThemeStyle } from "@/lib/site-theme-context";

export function ThemedBlogPost({
    title,
    publishedAt,
    content,
}: {
    title: string | null;
    publishedAt: string | null;
    content: TextEditorContent | null;
}) {
    const theme = useSiteThemeStyle();
    return (
        <Section theme={theme}>
            <article className="flex flex-col gap-4">
                <Header1 theme={theme}>{title}</Header1>
                {publishedAt && (
                    <Caption theme={theme}>
                        <time dateTime={publishedAt}>
                            {new Date(publishedAt).toLocaleDateString(
                                undefined,
                                {
                                    year: "numeric",
                                    month: "long",
                                    day: "numeric",
                                },
                            )}
                        </time>
                    </Caption>
                )}
                {content && <TextRenderer json={content} theme={theme} />}
            </article>
        </Section>
    );
}

export { ThemedDocArticle } from "@/components/themed-docs";
