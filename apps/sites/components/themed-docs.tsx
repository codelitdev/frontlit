import { SiteLink as Link } from "@/components/site-link";
import { BookOpen, ChevronRight, Folder } from "lucide-react";
import { TextRenderer } from "@frontlit/text-editor/renderer";
import type { TextEditorContent } from "@frontlit/text-editor";
import {
  Caption,
  Header1,
  Header4,
  Image,
  PageCard,
  PageCardContent,
  Section,
  Subheader1,
  Text1,
  Text2,
} from "@frontlit/page-builder/primitives/server";
import { getTeamThemeStyle } from "@/lib/team-theme";
import type { ThemeStyle } from "@frontlit/page-builder/models";
import { DocsSearch } from "@/components/docs-search";
import { collectionHref, type DocsCollection, type DocsNavItem } from "@/lib/docs-tree";

function Breadcrumb({
  items,
  theme,
}: {
  items: Array<{ label: string; href?: string }>;
  theme: ThemeStyle;
}) {
  return (
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1">
      {items.map((item, index) => {
        const last = index === items.length - 1;
        return (
          <span key={`${item.label}-${index}`} className="flex items-center gap-1">
            {index > 0 && (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            )}
            {item.href && !last ? (
              <Link href={item.href} className="hover:underline">
                <Caption theme={theme}>{item.label}</Caption>
              </Link>
            ) : (
              <Caption theme={theme}>{item.label}</Caption>
            )}
          </span>
        );
      })}
    </nav>
  );
}

export async function ThemedDocumentationFeed({
  title,
  subtitle,
  collections,
  teamId,
  publicApiBaseUrl,
}: {
  title: string;
  subtitle?: string | null;
  collections: DocsCollection[];
  teamId: string;
  publicApiBaseUrl?: string;
}) {
  const theme = await getTeamThemeStyle(teamId);
  const hasCollections = collections.length > 0;
  return (
    <div className="flex flex-col gap-10">
      <header className="mx-auto flex w-full max-w-2xl flex-col items-center gap-4 text-center">
        <Header1 theme={theme}>{title}</Header1>
        <Subheader1 theme={theme} component="span">
          {subtitle || "Advice and answers from the team."}
        </Subheader1>
        {teamId && publicApiBaseUrl ? (
          <div className="w-full pt-2">
            <DocsSearch teamId={teamId} publicApiBaseUrl={publicApiBaseUrl} />
          </div>
        ) : null}
      </header>
      {hasCollections ? (
        <div className="grid gap-6 sm:grid-cols-2">
          {collections.map((collection) => {
            const href = collectionHref(collection);
            const preview = collection.items.slice(0, 3);
            const card = (
              <PageCard theme={theme} isLink={Boolean(href)} className="h-full">
                <PageCardContent theme={theme} className="flex h-full flex-col gap-4">
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <Folder className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <Header4 theme={theme}>{collection.name}</Header4>
                      <Caption theme={theme}>
                        {collection.items.length === 1
                          ? "1 article"
                          : `${collection.items.length} articles`}
                      </Caption>
                    </div>
                  </div>
                  {preview.length > 0 && (
                    <ul className="flex flex-col gap-1.5">
                      {preview.map((item) => (
                        <li
                          key={item.documentId}
                          className="truncate text-muted-foreground"
                        >
                          {href ? (
                            <Text2 theme={theme}>{item.title ?? item.slug}</Text2>
                          ) : (
                            <Link
                              href={`/docs/${item.slug}`}
                              className="hover:underline"
                            >
                              <Text2 theme={theme}>{item.title ?? item.slug}</Text2>
                            </Link>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </PageCardContent>
              </PageCard>
            );
            return href ? (
              <Link
                key={collection.sectionId ?? "more"}
                href={href}
                className="block h-full"
              >
                {card}
              </Link>
            ) : (
              <div key="more">{card}</div>
            );
          })}
        </div>
      ) : (
        <Text2 theme={theme} className="text-center">
          No documentation published yet.
        </Text2>
      )}
    </div>
  );
}

export async function ThemedDocCollection({
  collection,
  teamId,
  publicApiBaseUrl,
}: {
  collection: DocsCollection;
  teamId: string;
  publicApiBaseUrl?: string;
}) {
  const theme = await getTeamThemeStyle(teamId);
  return (
    <Section theme={theme}>
      <div className="flex flex-col gap-8">
        <Breadcrumb
          theme={theme}
          items={[{ label: "Help Center", href: "/docs" }, { label: collection.name }]}
        />
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Folder className="h-5 w-5" />
            </span>
            <div>
              <Header1 theme={theme}>{collection.name}</Header1>
              <Caption theme={theme}>
                {collection.items.length === 1
                  ? "1 article"
                  : `${collection.items.length} articles`}
              </Caption>
            </div>
          </div>
          {teamId && publicApiBaseUrl ? (
            <div className="w-full sm:max-w-sm">
              <DocsSearch
                teamId={teamId}
                publicApiBaseUrl={publicApiBaseUrl}
                size="sm"
              />
            </div>
          ) : null}
        </div>
        {collection.items.length === 0 ? (
          <Text2 theme={theme}>No articles in this collection yet.</Text2>
        ) : (
          <ul className="flex flex-col gap-3">
            {collection.items.map((item) => (
              <li key={item.documentId}>
                <Link href={`/docs/${item.slug}`} className="block">
                  <PageCard theme={theme} isLink>
                    <PageCardContent
                      theme={theme}
                      className="flex items-start justify-between gap-4"
                    >
                      <div className="flex min-w-0 flex-col gap-1">
                        <Header4 theme={theme}>{item.title ?? item.slug}</Header4>
                        {item.excerpt && <Text2 theme={theme}>{item.excerpt}</Text2>}
                      </div>
                      <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                    </PageCardContent>
                  </PageCard>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Section>
  );
}

function DocsSidebar({
  collections,
  currentSlug,
  theme,
}: {
  collections: DocsCollection[];
  currentSlug: string;
  theme: ThemeStyle;
}) {
  return (
    <nav aria-label="Documentation" className="flex flex-col gap-6">
      <Link href="/docs" className="flex items-center gap-2 hover:underline">
        <BookOpen className="h-4 w-4" />
        <Text2 theme={theme} className="font-semibold">
          Help Center
        </Text2>
      </Link>
      {collections.map((collection) => {
        return (
          <div key={collection.sectionId ?? "more"} className="flex flex-col gap-2">
            {collectionHref(collection) ? (
              <Link href={collectionHref(collection)!} className="hover:underline">
                <Text2 theme={theme} className="font-semibold">
                  {collection.name}
                </Text2>
              </Link>
            ) : (
              <Text2 theme={theme} className="font-semibold">
                {collection.name}
              </Text2>
            )}
            <ul className="flex flex-col gap-1 border-l border-border pl-3">
              {collection.items.map((item) => {
                const isCurrent = item.slug === currentSlug;
                return (
                  <li key={item.documentId}>
                    <Link
                      href={`/docs/${item.slug}`}
                      className={
                        isCurrent
                          ? "font-medium text-foreground"
                          : "text-muted-foreground hover:text-foreground hover:underline"
                      }
                      aria-current={isCurrent ? "page" : undefined}
                    >
                      <Text1 theme={theme} component="span">
                        {item.title ?? item.slug}
                      </Text1>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

export async function ThemedDocArticle({
  title,
  content,
  featuredImage,
  headings,
  collections,
  currentSlug,
  collection,
  teamId,
  publicApiBaseUrl,
}: {
  title: string | null;
  content: TextEditorContent | null;
  featuredImage?: Record<string, unknown> | null;
  headings: Array<{ id: string; text: string }>;
  collections: DocsCollection[];
  currentSlug: string;
  collection: DocsCollection | null;
  teamId: string;
  publicApiBaseUrl?: string;
}) {
  const theme = await getTeamThemeStyle(teamId);
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
  const crumbs = [
    { label: "Help Center", href: "/docs" },
    ...(collection
      ? [
          {
            label: collection.name,
            href: collectionHref(collection) ?? undefined,
          },
        ]
      : []),
    { label: title ?? currentSlug },
  ];

  return (
    <Section theme={theme}>
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <Breadcrumb theme={theme} items={crumbs} />
          {teamId && publicApiBaseUrl ? (
            <div className="w-full lg:max-w-xs">
              <DocsSearch
                teamId={teamId}
                publicApiBaseUrl={publicApiBaseUrl}
                size="sm"
              />
            </div>
          ) : null}
        </div>
        <div className="grid gap-10 lg:grid-cols-[220px_minmax(0,1fr)_200px]">
          <aside className="hidden lg:block">
            <div className="sticky top-24">
              <DocsSidebar
                collections={collections}
                currentSlug={currentSlug}
                theme={theme}
              />
            </div>
          </aside>
          <article className="flex min-w-0 flex-col gap-8">
            <details className="lg:hidden">
              <summary className="cursor-pointer">
                <Text2 theme={theme} className="font-medium">
                  Browse articles
                </Text2>
              </summary>
              <div className="mt-4">
                <DocsSidebar
                  collections={collections}
                  currentSlug={currentSlug}
                  theme={theme}
                />
              </div>
            </details>
            {imageUrl && (
              <div className="overflow-hidden rounded-lg">
                <Image
                  src={imageUrl}
                  alt={imageAlt}
                  theme={theme}
                  priority
                  sizes="(min-width: 1024px) 768px, 100vw"
                  className="aspect-[2/1] max-h-[400px] w-full object-cover"
                />
              </div>
            )}
            <Header1 theme={theme}>{title}</Header1>
            {content && (
              <TextRenderer json={content} theme={theme} profile="documentation" />
            )}
          </article>
          {headings.length > 0 ? (
            <nav aria-label="On this page" className="hidden lg:block">
              <div className="sticky top-24 flex flex-col gap-3">
                <Text2 theme={theme} className="font-semibold">
                  On this page
                </Text2>
                <ul className="flex flex-col gap-2">
                  {headings.map((heading) => (
                    <li key={heading.id}>
                      <a href={`#${heading.id}`}>
                        <Caption theme={theme}>{heading.text}</Caption>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            </nav>
          ) : (
            <div className="hidden lg:block" />
          )}
        </div>
      </div>
    </Section>
  );
}

export type { DocsCollection, DocsNavItem };
