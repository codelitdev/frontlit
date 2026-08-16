import type { ChatSource } from "@/lib/use-visitor-chat";

export function CitationList({ sources }: { sources?: ChatSource[] | null }) {
    if (!sources?.length) return null;
    const unique = sources.filter(
        (source, index, list) =>
            list.findIndex((item) => item.documentId === source.documentId) ===
            index,
    );
    return (
        <div className="mt-1.5 px-1">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Sources
            </p>
            <ol className="mt-0.5 flex flex-col gap-0.5 text-xs text-muted-foreground">
                {unique.map((source, index) => (
                    <li key={source.documentId}>
                        <a
                            href={`/docs/${source.slug}${source.anchor ? `#${source.anchor}` : ""}`}
                            target="_blank"
                            rel="noreferrer"
                            className="underline underline-offset-2 hover:text-foreground"
                        >
                            [{index + 1}] {source.title ?? source.slug}
                        </a>
                    </li>
                ))}
            </ol>
        </div>
    );
}
