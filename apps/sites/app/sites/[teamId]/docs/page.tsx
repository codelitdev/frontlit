import type { Metadata, ResolvingMetadata } from "next";
import Link from "next/link";
import { listDocSections, listDocs } from "@/lib/api";
import { SiteChrome } from "@/components/site-chrome";

interface Props {
    params: Promise<{ teamId: string }>;
}

export async function generateMetadata(
    { params }: Props,
    parent: ResolvingMetadata,
): Promise<Metadata> {
    const previous = await parent;
    return { title: `Docs | ${previous.title?.absolute}` };
}

export default async function DocsIndexPage({ params }: Props) {
    const { teamId } = await params;
    const [sections, { items }] = await Promise.all([
        listDocSections(teamId),
        listDocs(teamId, { itemsPerPage: 500 }),
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
    for (const docs of bySection.values())
        docs.sort((a, b) => (a.meta.order ?? 0) - (b.meta.order ?? 0));

    return (
        <SiteChrome teamId={teamId} pageSlug="docs">
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
                        No docs published yet.
                    </p>
                )}
            </main>
        </SiteChrome>
    );
}
