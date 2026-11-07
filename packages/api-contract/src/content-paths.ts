import type { DocumentKind } from "./schemas/documents";

export function publicContentPath(
  kind: DocumentKind | "page" | "api-operation" | null | undefined,
  slug: string,
  anchor?: string | null,
): string {
  const hash = anchor ? `#${encodeURIComponent(anchor)}` : "";
  // Builder pages: "" is the home page.
  if (kind === "page")
    return `/${slug.split("/").filter(Boolean).map(encodeURIComponent).join("/")}${hash}`;
  if (kind === "blog") return `/blog/${encodeURIComponent(slug)}${hash}`;
  if (kind === "changelog") {
    return `/changelog${hash || `#${encodeURIComponent(slug)}`}`;
  }
  // Docs slugs and API reference routes can be nested (`api-reference/list-contacts`).
  return `/docs/${slug.split("/").map(encodeURIComponent).join("/")}${hash}`;
}

export function workspaceContentPath(
  kind: DocumentKind | "page" | "api-operation" | null | undefined,
  documentId: string,
): string {
  if (kind === "page") return "/website";
  if (kind === "blog") return `/editor/content/articles/${documentId}`;
  if (kind === "changelog") return `/editor/content/changelog/${documentId}`;
  return `/editor/content/documentation/${documentId}`;
}
