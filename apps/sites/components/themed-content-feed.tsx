import { SiteLink as Link } from "@/components/site-link";
import { TextRenderer } from "@frontlit/text-editor/renderer";
import type { TextEditorContent } from "@frontlit/text-editor";
import {
  Badge,
  Caption,
  Header1,
  Header4,
  Image,
  Subheader1,
  Text2,
} from "@frontlit/page-builder/primitives/server";
import { getTeamThemeStyle } from "@/lib/team-theme";
import type { ThemeStyle } from "@frontlit/page-builder/models";

function FeedHeading({
  title,
  subtitle,
  theme,
}: {
  title: string;
  subtitle?: string | null;
  theme: ThemeStyle;
}) {
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

export async function ThemedArticleFeed({
  teamId,
  title,
  subtitle,
  items,
}: {
  teamId: string;
  title: string;
  subtitle?: string | null;
  items: Array<{
    documentId: string;
    slug: string;
    title: string | null;
    excerpt: string | null;
    publishedAt: string | null;
    featuredImage?: Record<string, unknown> | null;
  }>;
}) {
  const theme = await getTeamThemeStyle(teamId);
  return (
    <div className="flex flex-col gap-10">
      <FeedHeading title={title} subtitle={subtitle} theme={theme} />
      {items.length === 0 ? (
        <Text2 theme={theme}>No articles published yet.</Text2>
      ) : (
        <ul className="flex flex-col gap-8">
          {items.map((post) => {
            const img = post.featuredImage;
            const imageUrl =
              typeof img?.url === "string"
                ? img.url
                : typeof img?.file === "string"
                  ? img.file
                  : typeof img?.src === "string"
                    ? img.src
                    : null;
            const imageAlt =
              typeof img?.alt === "string"
                ? img.alt
                : typeof img?.caption === "string"
                  ? img.caption
                  : typeof img?.title === "string"
                    ? img.title
                    : "";

            return (
              <li key={post.documentId}>
                <Link href={`/blog/${post.slug}`} className="group flex flex-col gap-2">
                  {imageUrl && (
                    <div className="mb-2 overflow-hidden rounded-lg">
                      <Image
                        src={imageUrl}
                        alt={imageAlt}
                        theme={theme}
                        sizes="(min-width: 1024px) 1024px, 100vw"
                        className="aspect-[16/9] max-h-72 w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    </div>
                  )}
                  <Header4 theme={theme} className="group-hover:underline">
                    {post.title}
                  </Header4>
                  {post.excerpt && <Text2 theme={theme}>{post.excerpt}</Text2>}
                  {post.publishedAt && (
                    <Caption theme={theme}>
                      <time dateTime={post.publishedAt}>
                        {formatDate(post.publishedAt)}
                      </time>
                    </Caption>
                  )}
                </Link>
              </li>
            );
          })}
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

export async function ThemedProductUpdatesFeed({
  teamId,
  title,
  subtitle,
  jsonLd,
  items,
}: {
  teamId: string;
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
  const theme = await getTeamThemeStyle(teamId);
  return (
    <div className="flex flex-col gap-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      <FeedHeading title={title} subtitle={subtitle} theme={theme} />
      {items.length === 0 ? (
        <Text2 theme={theme}>No changelog entries published yet.</Text2>
      ) : (
        <ol className="flex flex-col gap-12 border-l border-border pl-8">
          {items.map((entry) => (
            <li key={entry.documentId} className="relative">
              <span className="absolute -left-[calc(2rem+5px)] top-1.5 h-2.5 w-2.5 rounded-full bg-muted-foreground" />
              <div className="flex flex-wrap items-center gap-2">
                {entry.meta.version && (
                  <Caption theme={theme}>{entry.meta.version}</Caption>
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
                    variant={LABEL_VARIANT[label] ?? "secondary"}
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
                  <TextRenderer json={entry.content} theme={theme} />
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
