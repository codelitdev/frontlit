import type { Metadata, ResolvingMetadata } from "next";
import { notFound } from "next/navigation";
import { TextRenderer, extractHeadings } from "@frontlit/text-editor";
import { getDocBySlug, getSettings } from "@/lib/api";
import { resolveSeo } from "@/lib/seo";
import { getPrimaryHost } from "@/lib/request-host";
import { serializeJsonLd, techArticleJsonLd } from "@/lib/json-ld";

interface Props {
    params: Promise<{ teamId: string; slug: string }>;
}

export async function generateMetadata({ params }: Props, parent: ResolvingMetadata): Promise<Metadata> {
    const { teamId, slug } = await params;
    const [doc, settings, previous] = await Promise.all([getDocBySlug(teamId, slug), getSettings(teamId), parent]);
    if (!doc) return {};

    const seo = resolveSeo({ title: doc.title, description: doc.excerpt, image: doc.featuredImage }, settings, previous.title?.absolute || "FrontLit site");

    return {
        title: `${seo.title} | ${previous.title?.absolute}`,
        description: seo.description ?? undefined,
        alternates: { canonical: `https://${await getPrimaryHost()}/docs/${slug}` },
        openGraph: { title: seo.title, description: seo.description ?? undefined, images: seo.imageUrl ? [{ url: seo.imageUrl }] : undefined },
        robots: { index: seo.robotsIndex, follow: seo.robotsIndex },
    };
}

export default async function DocPage({ params }: Props) {
    const { teamId, slug } = await params;
    const doc = await getDocBySlug(teamId, slug);
    if (!doc) notFound();

    const primaryHost = await getPrimaryHost();
    const headings = doc.content ? extractHeadings(doc.content as any) : [];

    return (
        <main className="mx-auto max-w-5xl px-6 py-16">
            <script
                type="application/ld+json"
                // eslint-disable-next-line react/no-danger
                dangerouslySetInnerHTML={{
                    __html: serializeJsonLd(
                        techArticleJsonLd({
                            title: doc.title ?? slug,
                            excerpt: doc.excerpt,
                            publishedAt: doc.publishedAt,
                            updatedAt: doc.updatedAt,
                            url: `https://${primaryHost}/docs/${slug}`,
                            breadcrumb: [
                                { name: "Docs", url: `https://${primaryHost}/docs` },
                                { name: doc.title ?? slug, url: `https://${primaryHost}/docs/${slug}` },
                            ],
                        }),
                    ),
                }}
            />
            <div className="grid gap-10 lg:grid-cols-[1fr_220px]">
                <article>
                    <h1 className="text-3xl font-bold">{doc.title}</h1>
                    {doc.content && (
                        <div className="prose mt-8 max-w-none">
                            <TextRenderer json={doc.content} />
                        </div>
                    )}
                </article>
                {headings.length > 0 && (
                    <nav className="hidden lg:block">
                        <p className="text-sm font-semibold text-neutral-500">On this page</p>
                        <ul className="mt-3 flex flex-col gap-2 text-sm">
                            {headings.map((heading) => (
                                <li key={heading.id}>
                                    <a href={`#${heading.id}`} className="text-neutral-600 hover:underline">
                                        {heading.text}
                                    </a>
                                </li>
                            ))}
                        </ul>
                    </nav>
                )}
            </div>
        </main>
    );
}
