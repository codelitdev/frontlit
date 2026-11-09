import type { SearchResult } from "../search/search";

export interface ChatSource {
  documentId: string;
  slug: string;
  title: string | null;
  anchor: string | null;
  kind?: SearchResult["kind"];
  revisionId?: string;
  publicationId?: string | null;
  policyEpoch?: number;
  evidenceId?: string;
  url?: string;
}

/** Pull 1-based `[n]` markers out of model prose. Used instead of a
 * structured `citations` field so every supported provider can cite
 * without JSON-schema / structured-output differences. */
export function extractCitationIndexes(answer: string, chunkCount: number): number[] {
  if (chunkCount <= 0) return [];
  const indexes = [...answer.matchAll(/\[(\d+)\]/g)]
    .map((match) => Number(match[1]))
    .filter((value) => Number.isInteger(value) && value >= 1 && value <= chunkCount);
  return [...new Set(indexes)].slice(0, 8);
}

export function toSources(chunks: SearchResult[]): ChatSource[] {
  const seen = new Set<string>();
  const sources: ChatSource[] = [];
  for (const chunk of chunks) {
    if (seen.has(chunk.documentId)) continue;
    seen.add(chunk.documentId);
    sources.push({
      documentId: chunk.documentId,
      slug: chunk.slug,
      title: chunk.title,
      anchor: chunk.anchor,
      kind: chunk.kind,
      ...(chunk.revisionId ? { revisionId: chunk.revisionId } : {}),
      ...(chunk.publicationId ? { publicationId: chunk.publicationId } : {}),
      ...(chunk.policyEpoch !== undefined ? { policyEpoch: chunk.policyEpoch } : {}),
      ...(chunk.evidenceId ? { evidenceId: chunk.evidenceId } : {}),
      ...(chunk.url ? { url: chunk.url } : {}),
    });
  }
  return sources;
}

/** Map 1-based help-article indexes from the model onto unique sources.
 * Only supplied evidence can become a source. Missing citations return no sources. */
export function sourcesFromCitations(
  chunks: SearchResult[],
  citations: number[],
): ChatSource[] {
  const picked: SearchResult[] = [];
  const seen = new Set<number>();
  for (const index of citations) {
    if (!Number.isInteger(index) || seen.has(index)) continue;
    const chunk = chunks[index - 1];
    if (!chunk) continue;
    seen.add(index);
    picked.push(chunk);
  }
  return toSources(picked);
}

/** Model indexes refer to retrieved chunks; the UI numbers the cited source list. */
export function normalizeCitedAnswer(answer: string, chunks: SearchResult[]) {
  const sources = sourcesFromCitations(
    chunks,
    extractCitationIndexes(answer, chunks.length),
  );
  const indexes = new Map(
    sources.map((source, index) => [source.documentId || source.slug, index + 1]),
  );
  return {
    sources,
    answer: answer
      .replace(/\[(\d+)\]/g, (marker, number) => {
        const chunk = chunks[Number(number) - 1];
        const index = chunk ? indexes.get(chunk.documentId || chunk.slug) : undefined;
        return index === undefined ? marker : `[${index}]`;
      })
      // Two passages of one source become one marker: "[1][1]" → "[1]".
      .replace(/(\[\d+\])(?:\s*\1)+/g, "$1"),
  };
}

/** Escapes text placed inside prompt delimiters so it can't close them
 * (architecture.md §13.4 prompt-injection containment). */
export function escapePromptData(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
export function hasValidCitations(answer: string, chunkCount: number) {
  const markers = [...answer.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1]));
  return (
    markers.length > 0 &&
    markers.every((n) => Number.isInteger(n) && n >= 1 && n <= chunkCount)
  );
}
/** URLs in generated prose must come from server-supplied evidence too. */
export function hasValidEvidenceAnswer(answer: string, chunks: SearchResult[]) {
  if (!hasValidCitations(answer, chunks.length)) return false;
  const cited = extractCitationIndexes(answer, chunks.length).map(
    (index) => chunks[index - 1],
  );
  const urls = [...answer.matchAll(/https?:\/\/[^\s<>\])]+|\]\(([^)]+)\)/g)].map(
    (match) => match[1] ?? match[0],
  );
  return urls.every((url) => cited.some((chunk) => chunk.url === url));
}
export const MISSING_EVIDENCE_COPY =
  "I couldn't verify this from the published documentation. Could you clarify what you need, or contact support?";

/** Wrap the latest visitor text so the model treats it as data, not instructions. */
export function wrapVisitorMessage(question: string): string {
  const sanitized = escapePromptData(question.trim());
  return `<visitor_message>\n${sanitized}\n</visitor_message>`;
}
