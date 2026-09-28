import type { DocumentKind } from "./schemas/documents";

export function publicContentPath(
  kind: DocumentKind | null | undefined,
  slug: string,
  anchor?: string | null,
): string {
  const hash = anchor ? `#${encodeURIComponent(anchor)}` : "";
  if (kind === "blog") return `/blog/${encodeURIComponent(slug)}${hash}`;
  if (kind === "changelog") {
    return `/changelog${hash || `#${encodeURIComponent(slug)}`}`;
  }
  return `/docs/${encodeURIComponent(slug)}${hash}`;
}

export function workspaceContentPath(
  kind: DocumentKind | null | undefined,
  documentId: string,
): string {
  if (kind === "blog") return `/editor/content/articles/${documentId}`;
  if (kind === "changelog") return `/editor/content/changelog/${documentId}`;
  return `/editor/content/documentation/${documentId}`;
}
