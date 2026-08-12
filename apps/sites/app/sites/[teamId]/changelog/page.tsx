import type { Metadata, ResolvingMetadata } from "next";
import { TextRenderer } from "@frontlit/text-editor";
import { getSettings, listChangelogs } from "@/lib/api";
import { getCanonicalHost } from "@/lib/request-host";
import { changelogJsonLd, serializeJsonLd } from "@/lib/json-ld";
import { SiteChrome } from "@/components/site-chrome";

interface Props {
    params: Promise<{ teamId: string }>;
}

export async function generateMetadata(
    { params }: Props,
    parent: ResolvingMetadata,
): Promise<Metadata> {
    const previous = await parent;
    return {
        title: `Changelog | ${previous.title?.absolute}`,
        alternates: { types: { "application/rss+xml": "/changelog/rss.xml" } },
    };
}

const LABEL_CLASS: Record<string, string> = {
    added: "bg-emerald-100 text-emerald-700",
    fixed: "bg-amber-100 text-amber-700",
    improved: "bg-sky-100 text-sky-700",
    removed: "bg-rose-100 text-rose-700",
};

export default async function ChangelogPage({ params }: Props) {
    const { teamId } = await params;
    const [settings, { items }, canonicalHost] = await Promise.all([
        getSettings(teamId),
        listChangelogs(teamId, { itemsPerPage: 100 }),
        getCanonicalHost(),
    ]);

    return (
        <SiteChrome teamId={teamId} pageSlug="changelog">
            <main className="mx-auto max-w-3xl px-6 py-16">
                <script
                    type="application/ld+json"
                    // eslint-disable-next-line react/no-danger
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
                <h1 className="text-3xl font-bold">Changelog</h1>
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
                                {(entry.meta.labels ?? []).map((label) => (
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
                            No changelog entries published yet.
                        </p>
                    )}
                </ol>
            </main>
        </SiteChrome>
    );
}
