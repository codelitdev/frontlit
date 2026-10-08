import { DOCS_SCHEMA_VERSION } from "./extensions";
import { DOCS_PARSER_VERSION } from "./markdown";
import { DOCS_HEADING_POLICY_VERSION } from "./headings";
import { requireDocsContent } from "./validate";
import type { DocsFrontmatter, PlainData } from "./frontmatter";

function stable(value: PlainData): PlainData {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stable(value[key])]),
    );
  return value;
}

/** DM-CONVERT: include conversion and retrieval versions in immutable content identities. */
export async function hashDocsContent(input: {
  content: unknown;
  metadata: DocsFrontmatter;
  embeddingConfigurationVersion: string;
}): Promise<string> {
  const canonical = stable({
    content: requireDocsContent(input.content) as PlainData,
    metadata: input.metadata,
    versions: {
      schema: DOCS_SCHEMA_VERSION,
      parser: DOCS_PARSER_VERSION,
      headings: DOCS_HEADING_POLICY_VERSION,
      embeddingConfiguration: input.embeddingConfigurationVersion,
    },
  });
  const bytes = new TextEncoder().encode(JSON.stringify(canonical));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
