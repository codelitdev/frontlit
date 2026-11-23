import { parseMarkdown, serializeMarkdown } from "../core/markdown";
import { asDocsError, DocsContentError, diagnostic } from "./diagnostics";
import { docsProfile, DOCS_LIMITS } from "./profile";
import {
  splitDocsFrontmatter,
  serializeDocsFrontmatter,
  type DocsFrontmatter,
} from "./frontmatter";

export const DOCS_PARSER_VERSION = 2;

/** DM-CONVERT: CommonMark/GFM is parsed as data. Unsupported constructs fail closed. */
export function parseDocsMarkdown(
  markdown: string,
  options: { file?: string; frontmatter?: boolean } = {},
) {
  if (
    typeof markdown !== "string" ||
    new TextEncoder().encode(markdown).length > DOCS_LIMITS.bytes
  )
    throw new DocsContentError([
      diagnostic("INVALID_DOCUMENT", "Markdown exceeds size limit.", {
        file: options.file,
      }),
    ]);
  const source =
    options.frontmatter === false
      ? { body: markdown, lineOffset: 0, frontmatter: undefined }
      : splitDocsFrontmatter(markdown, options.file);
  const content = asDocsError(() =>
    parseMarkdown(docsProfile, source.body, {
      file: options.file,
      lineOffset: source.lineOffset,
    }),
  );
  return { content, frontmatter: source.frontmatter };
}

export function serializeDocsMarkdown(
  input: unknown,
  frontmatter?: DocsFrontmatter,
): string {
  const markdown = asDocsError(() => serializeMarkdown(docsProfile, input));
  return (frontmatter ? serializeDocsFrontmatter(frontmatter) : "") + markdown;
}
