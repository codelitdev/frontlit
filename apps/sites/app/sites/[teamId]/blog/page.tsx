import type { Metadata, ResolvingMetadata } from "next";
import Link from "next/link";
import { getSettings, listBlogs } from "@/lib/api";

interface Props {
    params: Promise<{ teamId: string }>;
}

export async function generateMetadata(
    { params }: Props,
    parent: ResolvingMetadata,
): Promise<Metadata> {
    const previous = await parent;
    return {
        title: `Blog | ${previous.title?.absolute}`,
        alternates: { types: { "application/rss+xml": "/blog/rss.xml" } },
    };
}

export default async function BlogIndexPage({ params }: Props) {
    const { teamId } = await params;
    const [settings, { items }] = await Promise.all([
        getSettings(teamId),
        listBlogs(teamId, { itemsPerPage: 50 }),
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
                            className="block group"
                        >
                            <h2 className="text-xl font-semibold group-hover:underline">
                                {post.title}
                            </h2>
                            {post.excerpt && (
                                <p className="mt-2 text-neutral-600">
                                    {post.excerpt}
                                </p>
                            )}
                            {post.publishedAt && (
                                <time
                                    dateTime={post.publishedAt}
                                    className="mt-2 block text-sm text-neutral-400"
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
                    <p className="text-neutral-500">No posts published yet.</p>
                )}
            </ul>
        </main>
    );
}
