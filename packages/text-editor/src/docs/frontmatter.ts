import { parseDocument, stringify } from "yaml";
import { DOCS_LIMITS } from "./validate";
import { diagnostic, DocsContentError } from "./diagnostics";
import { isSafeDocsUrl } from "./urls";
import { normalizeDocsSlug } from "./routes";

export type PlainData =
  | null
  | string
  | number
  | boolean
  | PlainData[]
  | { [key: string]: PlainData };
export type DocsFrontmatter = Record<string, PlainData>;

/** DM-SOURCE: unknown metadata is retained as bounded, inert plain data. */
export function requireDocsFrontmatter(value: unknown, file?: string): DocsFrontmatter {
  const fail = (message: string, fieldPath = "frontmatter"): never => {
    throw new DocsContentError([
      diagnostic("INVALID_FRONTMATTER", message, { fieldPath, file }),
    ]);
  };
  let count = 0;
  function check(v: unknown, depth: number, path: string): void {
    if (++count > 2000 || depth > 16) fail("Metadata exceeds structural limits.", path);
    if (
      v === null ||
      typeof v === "string" ||
      typeof v === "boolean" ||
      (typeof v === "number" && Number.isFinite(v))
    )
      return;
    if (Array.isArray(v)) {
      v.forEach((item, i) => {
        check(item, depth + 1, `${path}[${i}]`);
      });
      return;
    }
    if (
      typeof v !== "object" ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(v))
    )
      fail("Metadata must contain only plain data.", path);
    for (const [key, item] of Object.entries(v)) {
      if (["__proto__", "prototype", "constructor"].includes(key))
        fail("Reserved metadata key.", `${path}.${key}`);
      check(item, depth + 1, `${path}.${key}`);
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail("Frontmatter must be an object.");
  check(value, 0, "frontmatter");
  const meta = value as DocsFrontmatter;
  if (new TextEncoder().encode(JSON.stringify(meta)).length > DOCS_LIMITS.metadataBytes)
    fail("Metadata exceeds size limit.");
  if (typeof meta.title !== "string" || !meta.title.trim())
    fail("Title is required.", "frontmatter.title");
  for (const key of ["description", "slug", "nav_title"])
    if (meta[key] !== undefined && typeof meta[key] !== "string")
      fail(`${key} must be a string.`, `frontmatter.${key}`);
  if (meta.slug !== undefined) {
    try {
      normalizeDocsSlug(meta.slug);
    } catch (error) {
      if (error instanceof DocsContentError)
        throw new DocsContentError(
          error.diagnostics.map((item) => ({
            ...item,
            fieldPath: "frontmatter.slug",
            file,
          })),
        );
      throw error;
    }
  }
  if (meta.nav_order !== undefined && !Number.isSafeInteger(meta.nav_order))
    fail("nav_order must be an integer.", "frontmatter.nav_order");
  for (const key of ["published", "indexable"])
    if (meta[key] !== undefined && typeof meta[key] !== "boolean")
      fail(`${key} must be a boolean.`, `frontmatter.${key}`);
  if (meta.featured_image !== undefined) {
    const image = meta.featured_image;
    if (
      !image ||
      typeof image !== "object" ||
      Array.isArray(image) ||
      Object.keys(image).some((key) => !["url", "alt"].includes(key)) ||
      !isSafeDocsUrl(image.url, true) ||
      typeof image.alt !== "string"
    )
      fail(
        "featured_image must contain a stable HTTPS url and alt string.",
        "frontmatter.featured_image",
      );
  }
  return meta;
}

export function splitDocsFrontmatter(source: string, file?: string) {
  const normalized = source.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  if (!normalized.startsWith("---\n"))
    throw new DocsContentError([
      diagnostic("INVALID_FRONTMATTER", "Markdown requires frontmatter with a title.", {
        file,
        line: 1,
        column: 1,
      }),
    ]);
  const end = /^---[ \t]*$/gm;
  end.lastIndex = 4;
  const delimiter = end.exec(normalized);
  if (!delimiter)
    throw new DocsContentError([
      diagnostic("INVALID_FRONTMATTER", "Frontmatter is not closed.", {
        file,
        line: 1,
        column: 1,
      }),
    ]);
  const raw = normalized.slice(4, delimiter.index);
  if (new TextEncoder().encode(raw).length > DOCS_LIMITS.metadataBytes)
    throw new DocsContentError([
      diagnostic("INVALID_FRONTMATTER", "Frontmatter exceeds size limit.", { file }),
    ]);
  const doc = parseDocument(raw, {
    schema: "core",
    uniqueKeys: true,
    strict: true,
    merge: false,
  });
  if (doc.errors.length || doc.warnings.length) {
    throw new DocsContentError(
      [...doc.errors, ...doc.warnings].map((error) => {
        const offset = error.pos[0];
        const prefix = raw.slice(0, offset);
        return diagnostic("INVALID_FRONTMATTER", "Invalid YAML frontmatter.", {
          file,
          line: prefix.split("\n").length + 1,
          column: prefix.length - prefix.lastIndexOf("\n"),
        });
      }),
    );
  }
  let value: unknown;
  try {
    value = doc.toJS({ maxAliasCount: 0 });
  } catch {
    throw new DocsContentError([
      diagnostic("INVALID_FRONTMATTER", "YAML aliases are not supported.", {
        file,
        line: 2,
        column: 1,
      }),
    ]);
  }
  let frontmatter: DocsFrontmatter;
  try {
    frontmatter = requireDocsFrontmatter(value, file);
  } catch (error) {
    if (!(error instanceof DocsContentError)) throw error;
    throw new DocsContentError(
      error.diagnostics.map((item) => {
        const key = item.fieldPath?.split(".")[1];
        const field = key ? doc.get(key, true) : undefined;
        const offset =
          field && typeof field === "object" && "range" in field
            ? (field.range?.[0] ?? 0)
            : 0;
        const prefix = raw.slice(0, offset);
        return {
          ...item,
          file,
          line: prefix.split("\n").length + 1,
          column: prefix.length - prefix.lastIndexOf("\n"),
        };
      }),
    );
  }
  const start =
    delimiter.index +
    delimiter[0].length +
    (normalized[delimiter.index + delimiter[0].length] === "\n" ? 1 : 0);
  return {
    frontmatter,
    body: normalized.slice(start),
    lineOffset: normalized.slice(0, start).split("\n").length - 1,
  };
}

export function serializeDocsFrontmatter(meta: DocsFrontmatter): string {
  return `---\n${stringify(requireDocsFrontmatter(meta), { sortMapEntries: true, aliasDuplicateObjects: false, lineWidth: 0 })}---\n\n`;
}
