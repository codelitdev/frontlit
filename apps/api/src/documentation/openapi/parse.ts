import { isMap, isSeq, LineCounter, parse, parseDocument, type Node } from "yaml";
import { diagnostic, type DocsDiagnostic } from "@frontlit/text-editor/docs";

export const OPENAPI_LIMITS = { bytes: 5 * 1024 * 1024, operations: 500 };

export class OpenApiImportError extends Error {
  constructor(readonly diagnostics: DocsDiagnostic[]) {
    super("The OpenAPI spec is invalid.");
    this.name = "OpenApiImportError";
  }
}

/** Parses a JSON or YAML spec. YAML aliases are refused (no entity expansion). */
export function parseSpecText(text: string, file: string): unknown {
  try {
    if (/\.json$/i.test(file)) return JSON.parse(text);
    return parse(text, { maxAliasCount: 0, uniqueKeys: true });
  } catch (error) {
    const position = (error as { linePos?: { line: number; col: number }[] })
      .linePos?.[0];
    throw new OpenApiImportError([
      diagnostic(
        "OPENAPI_PARSE",
        `The spec could not be parsed: ${(error as Error).message.split("\n")[0]}`,
        { file, line: position?.line, column: position?.col },
      ),
    ]);
  }
}

export const escapePointer = (segment: string | number) =>
  String(segment).replace(/~/g, "~0").replace(/\//g, "~1");
export const pointer = (path: (string | number)[]) =>
  path.length ? `/${path.map(escapePointer).join("/")}` : "";
const unescapePointer = (segment: string) =>
  segment.replace(/~1/g, "/").replace(/~0/g, "~");

/** Adds line/column to diagnostics with a JSON pointer, parsing the source
 * again with positions only when there is something to locate. */
export function locateDiagnostics(text: string, items: DocsDiagnostic[]) {
  if (!items.some((item) => item.fieldPath && item.line === undefined)) return items;
  const lineCounter = new LineCounter();
  const doc = parseDocument(text, { lineCounter, keepSourceTokens: false });
  return items.map((item) => {
    if (!item.fieldPath || item.line !== undefined) return item;
    let node: unknown = doc.contents;
    let located: Node | null = null;
    for (const segment of item.fieldPath.split("/").slice(1).map(unescapePointer)) {
      if (isMap(node)) {
        const pair = node.items.find(
          (entry) =>
            String((entry.key as { value?: unknown })?.value ?? entry.key) === segment,
        );
        if (!pair) break;
        located = (pair.key as Node) ?? located;
        node = pair.value;
      } else if (isSeq(node)) {
        const child = node.items[Number(segment)];
        if (!child) break;
        located = child as Node;
        node = child;
      } else break;
    }
    const offset = located?.range?.[0];
    if (offset === undefined) return item;
    const { line, col } = lineCounter.linePos(offset);
    return { ...item, line, column: col };
  });
}
