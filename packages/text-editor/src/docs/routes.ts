import { DocsContentError, diagnostic } from "./diagnostics";

/** DM-ROUTE: fixed /docs prefix, Latin segments, case-folded collision identity. */
export function normalizeDocsSlug(value: unknown): string {
  return normalizePath(value, true);
}

function normalizePath(value: unknown, reserveRoutes: boolean): string {
  if (typeof value !== "string")
    throw new DocsContentError([
      diagnostic("INVALID_SLUG", "Slug must be a relative documentation path.", {
        fieldPath: "slug",
      }),
    ]);
  const slug = value.toLowerCase().replace(/\/$/, "");
  if (!slug || slug.length > 512 || !/^[a-z0-9-]+(?:\/[a-z0-9-]+)*$/.test(slug))
    throw new DocsContentError([
      diagnostic(
        "INVALID_SLUG",
        "Use lowercase ASCII letters, digits, and hyphens in slash-separated segments.",
        { fieldPath: "slug" },
      ),
    ]);
  if (reserveRoutes && ["collections", "search"].includes(slug.split("/")[0]))
    throw new DocsContentError([
      diagnostic(
        "RESERVED_ROUTE",
        "This path is reserved for documentation navigation.",
        { route: `/docs/${slug}`, fieldPath: "slug" },
      ),
    ]);
  return slug;
}

export function normalizeDocsSourceDirectory(value: string): string {
  const directory = value.replace(/\/$/, "");
  if (
    !directory ||
    directory.startsWith("/") ||
    // biome-ignore lint/suspicious/noControlCharactersInRegex: Reject control characters in repository paths.
    /[\\\u0000-\u001f]/.test(directory) ||
    directory
      .split("/")
      .some((segment) => !segment || segment === "." || segment === "..")
  )
    throw new DocsContentError([
      diagnostic("INVALID_REFERENCE", "Select a directory within the repository.", {
        fieldPath: "directory",
      }),
    ]);
  return directory;
}

/** Input path is repository-relative; callers must also reject symlink entries in Git trees. */
export function resolveDocsSourcePath(
  path: string,
  directory: string,
  explicitSlug?: string,
) {
  const root = normalizeDocsSourceDirectory(directory);
  if (!path.startsWith(`${root}/`))
    throw new DocsContentError([
      diagnostic(
        "INVALID_REFERENCE",
        "File is outside the configured docs directory.",
        { file: path },
      ),
    ]);
  const relativePath = path.slice(root.length + 1);
  const segments = relativePath.split("/");
  if (
    !relativePath.endsWith(".md") ||
    // biome-ignore lint/suspicious/noControlCharactersInRegex: Reject control characters in repository paths.
    /[\\\u0000-\u001f]/.test(relativePath) ||
    segments.some((segment) => !segment || segment === "." || segment === "..")
  )
    throw new DocsContentError([
      diagnostic("INVALID_REFERENCE", "Invalid Markdown source path.", { file: path }),
    ]);
  const defaultSlug = relativePath.slice(0, -3).replace(/\/index$/, "");
  const slug = normalizeDocsSlug(explicitSlug ?? defaultSlug);
  return {
    relativePath,
    slug,
    route: `/docs/${slug}`,
    sectionSlug: segments.length > 1 ? normalizePath(segments[0], false) : null,
  };
}
