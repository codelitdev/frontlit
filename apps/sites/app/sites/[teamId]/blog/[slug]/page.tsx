import type { Metadata, ResolvingMetadata } from "next";
import { notFound } from "next/navigation";
import { TextRenderer } from "@frontlit/text-editor";
import { getBlogBySlug, getSettings } from "@/lib/api";
import { resolveSeo } from "@/lib/seo";
import { getCanonicalHost } from "@/lib/request-host";
import { blogPostingJsonLd, serializeJsonLd } from "@/lib/json-ld";

interface Props {
    params: Promise<{ teamId: string; slug: string }>;
}

export async function generateMetadata({ params }: Props, parent: ResolvingMetadata): Promise<Metadata> {
    const { teamId, slug } = await params;
    const [post, settings, previous] = await Promise.all([getBlogBySlug(teamId, slug), getSettings(teamId), parent]);
    if (!post) return {};

    const seo = resolveSeo({ title: post.title, description: post.excerpt, image: post.featuredImage }, settings, previous.title?.absolute || "FrontLit site");

    return {
        title: `${seo.title} | ${previous.title?.absolute}`,
        description: seo.description ?? undefined,
        alternates: { canonical: `https://${await getCanonicalHost()}/blog/${slug}` },
        openGraph: {
            type: "article",
            title: seo.title,
            description: seo.description ?? undefined,
            images: seo.imageUrl ? [{ url: seo.imageUrl }] : undefined,
            publishedTime: post.publishedAt ?? undefined,
            modifiedTime: post.updatedAt ?? undefined,
        },
        robots: { index: seo.robotsIndex, follow: seo.robotsIndex },
    };
}

export default async function BlogPostPage({ params }: Props) {
    const { teamId, slug } = await params;
    const post = await getBlogBySlug(teamId, slug);
    if (!post) notFound();

    const canonicalHost = await getCanonicalHost();
    const url = `https://${canonicalHost}/blog/${slug}`;

    return (
        <main className="mx-auto max-w-3xl px-6 py-16">
            <script
                type="application/ld+json"
                // eslint-disable-next-line react/no-danger
                dangerouslySetInnerHTML={{
                    __html: serializeJsonLd(
                        blogPostingJsonLd({
                            title: post.title ?? slug,
                            excerpt: post.excerpt,
                            imageUrl: (post.featuredImage?.url as string | undefined) ?? null,
                            publishedAt: post.publishedAt,
                            updatedAt: post.updatedAt,
                            authorName: null,
                            url,
                        }),
                    ),
                }}
            />
            <article>
                <h1 className="text-3xl font-bold">{post.title}</h1>
                {post.publishedAt && (
                    <time dateTime={post.publishedAt} className="mt-2 block text-sm text-neutral-400">
                        {new Date(post.publishedAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}
                    </time>
                )}
                {post.content && (
                    <div className="prose mt-8 max-w-none">
                        <TextRenderer json={post.content} />
                    </div>
                )}
            </article>
        </main>
    );
}
