import { createHash } from "node:crypto";
import { z } from "zod";
import { parseStrictJson } from "./strict-json";
import {
  DOCS_LIMITS,
  DocsContentError,
  diagnostic,
  normalizeDocsSourceDirectory,
  parseDocsMarkdown,
  resolveDocsSourcePath,
} from "@frontlit/text-editor/docs";

export type GitTreeEntry = {
  path: string;
  mode: string;
  type: "blob" | "tree" | "commit";
  sha: string;
  size?: number;
};

export const GIT_DOCS_LIMITS = {
  files: 1000,
  bytes: 10 * 1024 * 1024,
  entries: 100_000,
};
const sectionsSchema = z
  .object({
    version: z.literal(1),
    sections: z
      .array(
        z
          .object({
            folder: z
              .string()
              .regex(/^[a-z0-9-]+$/)
              .max(512),
            name: z.string().trim().min(1).max(200),
            order: z.number().int().safe(),
          })
          .strict(),
      )
      .max(1000),
  })
  .strict();

function fail(code: string, message: string, file?: string): never {
  throw new DocsContentError([diagnostic(code, message, { file })]);
}

/** A complete tree and blobs from one immutable commit, never a webhook patch. */
export async function importDocumentationTree(input: {
  commitSha: string;
  directory: string;
  entries: GitTreeEntry[];
  previouslyPopulated?: boolean;
  readBlob: (sha: string) => Promise<Uint8Array>;
}) {
  if (!/^[a-f0-9]{40}$/.test(input.commitSha))
    fail("INVALID_REFERENCE", "An immutable Git commit SHA is required.");
  const directory = normalizeDocsSourceDirectory(input.directory);
  if (input.entries.length > GIT_DOCS_LIMITS.entries)
    fail("CANDIDATE_LIMIT", "Repository tree exceeds the supported size.");
  const paths = new Set<string>();
  for (const entry of input.entries) {
    if (paths.has(entry.path))
      fail("INVALID_REFERENCE", "Duplicate Git tree path.", entry.path);
    paths.add(entry.path);
    if (
      !entry.path ||
      entry.path.startsWith("/") ||
      /[\\\x00-\x1f]/.test(entry.path) ||
      entry.path.split("/").some((p) => !p || p === "." || p === "..") ||
      !/^[a-f0-9]{40}$/.test(entry.sha)
    )
      fail("INVALID_REFERENCE", "Invalid Git tree entry.", entry.path);
  }
  // Checking every ancestor prevents a configured directory traversing a symlink.
  const ancestors = directory
    .split("/")
    .map((_, i, parts) => parts.slice(0, i + 1).join("/"));
  for (const ancestor of ancestors) {
    const entry = input.entries.find((e) => e.path === ancestor);
    if (!entry && input.previouslyPopulated) continue;
    if (!entry || entry.type !== "tree" || entry.mode !== "040000")
      fail(
        "SOURCE_DIRECTORY_UNAVAILABLE",
        "The configured source directory must exist as a Git directory.",
        ancestor,
      );
  }
  const managed = input.entries.filter((e) => e.path.startsWith(`${directory}/`));
  if (managed.length && !paths.has(directory))
    fail(
      "INVALID_REFERENCE",
      "The complete Git tree is missing an ancestor directory.",
      directory,
    );
  for (const entry of managed) {
    if (entry.mode === "120000" || entry.mode === "160000" || entry.type === "commit")
      fail(
        "INVALID_REFERENCE",
        "Symlinks and submodules are unsupported inside docs.",
        entry.path,
      );
    if (/\.mdx$/i.test(entry.path))
      fail(
        "UNSUPPORTED_NODE",
        "MDX files are unsupported; use safe Markdown.",
        entry.path,
      );
  }
  const files = managed.filter(
    (e) =>
      e.type !== "tree" &&
      (e.path.endsWith(".md") || e.path === `${directory}/_sections.json`),
  );
  if (files.filter((e) => e.path.endsWith(".md")).length > GIT_DOCS_LIMITS.files)
    fail("CANDIDATE_LIMIT", "Documentation contains too many files.");
  let bytes = 0;
  async function read(entry: GitTreeEntry) {
    if (entry.type !== "blob" || !["100644", "100755"].includes(entry.mode))
      fail(
        "INVALID_REFERENCE",
        "Managed documentation must be a regular Git file.",
        entry.path,
      );
    const limit = entry.path.endsWith(".md")
      ? DOCS_LIMITS.bytes
      : DOCS_LIMITS.metadataBytes;
    if (entry.size !== undefined && entry.size > limit)
      fail("CANDIDATE_LIMIT", "Managed file exceeds its size limit.", entry.path);
    const data = await input.readBlob(entry.sha);
    bytes += data.byteLength;
    if (data.byteLength > limit || bytes > GIT_DOCS_LIMITS.bytes)
      fail("CANDIDATE_LIMIT", "Documentation text exceeds its size limit.", entry.path);
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(data);
      if (text.includes("\0"))
        fail("UNMANAGED_BINARY", "Managed files must contain UTF-8 text.", entry.path);
      return text;
    } catch (error) {
      if (error instanceof DocsContentError) throw error;
      return fail(
        "UNMANAGED_BINARY",
        "Managed files must contain UTF-8 text.",
        entry.path,
      );
    }
  }
  const metadataFile = files.find((e) => e.path === `${directory}/_sections.json`);
  let configuredSections: z.infer<typeof sectionsSchema>["sections"] = [];
  if (metadataFile) {
    const text = await read(metadataFile);
    try {
      configuredSections = sectionsSchema.parse(parseStrictJson(text)).sections;
    } catch {
      fail(
        "INVALID_SECTIONS",
        "Expected strict version 1 Section metadata.",
        metadataFile.path,
      );
    }
    if (
      new Set(configuredSections.map((s) => s.folder)).size !==
      configuredSections.length
    )
      fail("INVALID_SECTIONS", "Section folders must be unique.", metadataFile.path);
  }
  const folderNames = new Map<string, string>();
  const docs = [];
  for (const entry of files
    .filter((e) => e.path.endsWith(".md"))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))) {
    const markdown = await read(entry);
    const parsed = parseDocsMarkdown(markdown, { file: entry.path });
    const frontmatter = parsed.frontmatter!;
    const resolved = resolveDocsSourcePath(
      entry.path,
      directory,
      frontmatter.slug as string | undefined,
    );
    if (resolved.sectionSlug) {
      const name = resolved.relativePath.split("/")[0];
      const previous = folderNames.get(resolved.sectionSlug);
      if (previous && previous !== name)
        fail(
          "SECTION_COLLISION",
          "Distinct folders resolve to the same Section slug.",
          entry.path,
        );
      folderNames.set(resolved.sectionSlug, name);
    }
    docs.push({
      sourcePath: entry.path,
      blobSha: entry.sha,
      sourceHash: createHash("sha256").update(markdown).digest("hex"),
      markdown,
      frontmatter,
      content: parsed.content,
      ...resolved,
      published: frontmatter.published !== false,
      indexable: frontmatter.indexable !== false,
      title: (frontmatter.title as string).trim(),
      description: (frontmatter.description as string | undefined) ?? "",
      navTitle:
        (frontmatter.nav_title as string | undefined) ?? (frontmatter.title as string),
      navOrder: (frontmatter.nav_order as number | undefined) ?? 0,
    });
  }
  const routes = new Map<string, string>();
  for (const doc of docs.filter((d) => d.published)) {
    const previous = routes.get(doc.route);
    if (previous)
      throw new DocsContentError([
        diagnostic(
          "DUPLICATE_ROUTE",
          "Published documents resolve to the same route.",
          {
            file: doc.sourcePath,
            route: doc.route,
            relatedFiles: [previous],
          },
        ),
      ]);
    routes.set(doc.route, doc.sourcePath);
  }
  const sections = [...folderNames].map(([folder, name], order) => ({
    folder,
    name,
    order,
  }));
  for (const section of configuredSections) {
    const index = sections.findIndex((s) => s.folder === section.folder);
    if (index < 0) sections.push(section);
    else sections[index] = section;
  }
  sections.sort(
    (a, b) =>
      a.order - b.order || (a.folder < b.folder ? -1 : a.folder > b.folder ? 1 : 0),
  );
  docs.sort(
    (a, b) =>
      a.navOrder - b.navOrder ||
      (a.sourcePath < b.sourcePath ? -1 : a.sourcePath > b.sourcePath ? 1 : 0),
  );
  return { commitSha: input.commitSha, directory, docs, sections, bytes };
}

export type DocumentationGitManifest = Awaited<
  ReturnType<typeof importDocumentationTree>
>;
