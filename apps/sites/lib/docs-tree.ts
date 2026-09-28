import {
  listDocumentation,
  listDocumentationSections,
  type PublicDocument,
  type DocumentationMeta,
  type DocumentationSection,
} from "@/lib/api";

export type DocsNavItem = {
  documentId: string;
  slug: string;
  title: string | null;
  excerpt: string | null;
  featuredImage?: Record<string, unknown> | null;
};

export type DocsCollection = {
  sectionId: string | null;
  name: string;
  slug: string | null;
  items: DocsNavItem[];
};

function toNavItem(doc: PublicDocument<DocumentationMeta>): DocsNavItem {
  return {
    documentId: doc.documentId,
    slug: doc.slug,
    title: doc.title,
    excerpt: doc.excerpt,
    featuredImage: doc.featuredImage,
  };
}

export function buildDocsTree(
  sections: DocumentationSection[],
  items: PublicDocument<DocumentationMeta>[],
): DocsCollection[] {
  const bySection = new Map<string, PublicDocument<DocumentationMeta>[]>();
  const unsectioned: PublicDocument<DocumentationMeta>[] = [];
  for (const doc of items) {
    const sectionId = doc.meta.sectionId;
    if (!sectionId) {
      unsectioned.push(doc);
      continue;
    }
    if (!bySection.has(sectionId)) bySection.set(sectionId, []);
    bySection.get(sectionId)!.push(doc);
  }
  for (const docs of bySection.values()) {
    docs.sort((a, b) => (a.meta.order ?? 0) - (b.meta.order ?? 0));
  }

  const collections: DocsCollection[] = sections.map((section) => ({
    sectionId: section.sectionId,
    name: section.name,
    slug: section.slug,
    items: (bySection.get(section.sectionId) ?? []).map(toNavItem),
  }));
  if (unsectioned.length > 0) {
    collections.push({
      sectionId: null,
      name: "More",
      slug: null,
      items: unsectioned.map(toNavItem),
    });
  }
  return collections;
}

export async function loadDocsTree(teamId: string): Promise<DocsCollection[]> {
  const [sections, { items }] = await Promise.all([
    listDocumentationSections(teamId),
    listDocumentation(teamId, { itemsPerPage: 500 }),
  ]);
  return buildDocsTree(sections, items);
}

export function collectionHref(collection: DocsCollection): string | null {
  return collection.slug ? `/docs/collections/${collection.slug}` : null;
}
