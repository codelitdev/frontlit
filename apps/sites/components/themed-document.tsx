"use client";

import { TextRenderer, type TextEditorContent } from "@frontlit/text-editor";
import { Caption, Header1, Image, Section } from "@frontlit/page-builder/primitives";
import { useSiteThemeStyle } from "@/lib/site-theme-context";

export function ThemedBlogPost({
  title,
  publishedAt,
  content,
  featuredImage,
}: {
  title: string | null;
  publishedAt: string | null;
  content: TextEditorContent | null;
  featuredImage?: Record<string, unknown> | null;
}) {
  const theme = useSiteThemeStyle();
  const imageUrl =
    typeof featuredImage?.url === "string"
      ? featuredImage.url
      : typeof featuredImage?.file === "string"
        ? featuredImage.file
        : typeof featuredImage?.src === "string"
          ? featuredImage.src
          : null;
  const imageAlt =
    typeof featuredImage?.alt === "string"
      ? featuredImage.alt
      : typeof featuredImage?.caption === "string"
        ? featuredImage.caption
        : typeof featuredImage?.title === "string"
          ? featuredImage.title
          : "";

  return (
    <Section theme={theme}>
      <article className="flex flex-col gap-6">
        {imageUrl && (
          <div className="overflow-hidden rounded-lg">
            <Image
              src={imageUrl}
              alt={imageAlt}
              theme={theme}
              className="aspect-[2/1] max-h-[480px] w-full object-cover"
            />
          </div>
        )}
        <div className="flex flex-col gap-4">
          <Header1 theme={theme}>{title}</Header1>
          {publishedAt && (
            <Caption theme={theme}>
              <time dateTime={publishedAt}>
                {new Date(publishedAt).toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </time>
            </Caption>
          )}
        </div>
        {content && <TextRenderer json={content} theme={theme} />}
      </article>
    </Section>
  );
}

export { ThemedDocArticle } from "@/components/themed-docs";
