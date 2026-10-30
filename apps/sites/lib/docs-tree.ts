import {
  getApiReference,
  getDocumentationSnapshot,
  type PublicApiReference,
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
  /** API reference operations show their HTTP method. */
  method?: string;
  deprecated?: boolean;
};

export type DocsCollection = {
  sectionId: string | null;
  name: string;
  slug: string | null;
  items: DocsNavItem[];
  /** Set for the API reference (docs/openapi-support.md): its own landing
   * page and its operations grouped by tag. */
  api?: { href: string; groups: { name: string; items: DocsNavItem[] }[] };
};

function toNavItem(doc: PublicDocument<DocumentationMeta>): DocsNavItem {
  return {
    documentId: doc.documentId,
    slug: doc.slug,
    title:
      typeof doc.meta.frontmatter?.nav_title === "string" &&
      doc.meta.frontmatter.nav_title.trim()
        ? doc.meta.frontmatter.nav_title
        : doc.title,
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
  unsectioned.sort((a, b) => (a.meta.order ?? 0) - (b.meta.order ?? 0));

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

/** What readers look for in docs navigation; the spec's own title (e.g.
 * "Medialit API") is shown on the landing page instead. */
export const API_REFERENCE_LABEL = "API Reference";

/** The API reference as a docs Section, placed after the docs Sections. */
export function apiCollection(reference: PublicApiReference): DocsCollection {
  const groups = reference.groups.map((group) => ({
    name: group.name,
    items: group.operations.map((operation) => ({
      documentId: operation.route,
      slug: operation.route,
      title: operation.title,
      excerpt: null,
      method: operation.method,
      deprecated: operation.deprecated,
    })),
  }));
  return {
    sectionId: `api:${reference.mount}`,
    name: API_REFERENCE_LABEL,
    slug: reference.mount,
    items: groups.flatMap((group) => group.items),
    api: { href: `/docs/${reference.mount}`, groups },
  };
}

export async function loadDocsTree(teamId: string): Promise<DocsCollection[]> {
  const [{ sections, items }, reference] = await Promise.all([
    getDocumentationSnapshot(teamId),
    getApiReference(teamId),
  ]);
  const collections = buildDocsTree(sections, items);
  if (!reference) return collections;
  const more = collections.findIndex((collection) => collection.sectionId === null);
  collections.splice(
    more === -1 ? collections.length : more,
    0,
    apiCollection(reference),
  );
  return collections;
}

export function collectionHref(collection: DocsCollection): string | null {
  if (collection.api) return collection.api.href;
  return collection.slug ? `/docs/collections/${collection.slug}` : null;
}
