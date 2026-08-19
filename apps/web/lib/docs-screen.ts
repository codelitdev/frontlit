import type { DocumentationSection, DocumentationPage } from "./api";

export type DocsFilter = "all" | "published" | "draft" | "changes";

export interface DocStatusCounts {
    all: number;
    published: number;
    draft: number;
    changes: number;
}

export interface DocGroup {
    id: string | null;
    name: string;
    section?: DocumentationSection;
    docs: DocumentationPage[];
}

export function getDocStatusCounts(docs: DocumentationPage[]): DocStatusCounts {
    return docs.reduce<DocStatusCounts>(
        (counts, doc) => {
            counts.all += 1;
            if (
                doc.status === "published" ||
                doc.status === "published_with_changes"
            )
                counts.published += 1;
            if (doc.status === "draft") counts.draft += 1;
            if (doc.status === "published_with_changes") counts.changes += 1;
            return counts;
        },
        { all: 0, published: 0, draft: 0, changes: 0 },
    );
}

export function filterDocs(
    docs: DocumentationPage[],
    filter: DocsFilter,
    query: string,
): DocumentationPage[] {
    const normalizedQuery = query.trim().toLowerCase();

    return docs.filter((doc) => {
        const matchesStatus =
            filter === "all" ||
            (filter === "published" &&
                (doc.status === "published" ||
                    doc.status === "published_with_changes")) ||
            (filter === "draft" && doc.status === "draft") ||
            (filter === "changes" && doc.status === "published_with_changes");

        if (!matchesStatus) return false;
        if (!normalizedQuery) return true;

        return (
            doc.draftTitle.toLowerCase().includes(normalizedQuery) ||
            doc.slug.toLowerCase().includes(normalizedQuery)
        );
    });
}

export function groupDocsBySection(
    docs: DocumentationPage[],
    sections: DocumentationSection[],
): DocGroup[] {
    const orderedSections = [...sections].sort(
        (left, right) =>
            left.order - right.order || left.name.localeCompare(right.name),
    );
    const knownSectionIds = new Set(
        orderedSections.map((section) => section.sectionId),
    );
    const sortDocs = (items: DocumentationPage[]) =>
        [...items].sort(
            (left, right) =>
                left.draftMeta.order - right.draftMeta.order ||
                left.draftTitle.localeCompare(right.draftTitle),
        );

    const groups: DocGroup[] = orderedSections.map((section) => ({
        id: section.sectionId,
        name: section.name,
        section,
        docs: sortDocs(
            docs.filter((doc) => doc.draftMeta.sectionId === section.sectionId),
        ),
    }));
    const unsectionedDocs = docs.filter(
        (doc) =>
            !doc.draftMeta.sectionId ||
            !knownSectionIds.has(doc.draftMeta.sectionId),
    );

    if (unsectionedDocs.length > 0) {
        groups.push({
            id: null,
            name: "Unsectioned",
            docs: sortDocs(unsectionedDocs),
        });
    }

    return groups;
}
