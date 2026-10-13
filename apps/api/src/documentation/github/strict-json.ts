/** JSON.parse permits duplicate object keys. Repository metadata must not. */
export function parseStrictJson(source: string): unknown {
  const parsed: unknown = JSON.parse(source);
  const tokens =
    source.match(
      /"(?:[^"\\]|\\.)*"|[{}\[\]:,]|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null/g,
    ) ?? [];
  let cursor = 0;
  function value() {
    const token = tokens[cursor++];
    if (token === "{") {
      const keys = new Set<string>();
      while (tokens[cursor] !== "}") {
        const key = JSON.parse(tokens[cursor++]) as string;
        if (keys.has(key)) throw new Error("Duplicate JSON key");
        keys.add(key);
        cursor++; // colon; syntax has already been checked by JSON.parse
        value();
        if (tokens[cursor] === ",") cursor++;
      }
      cursor++;
    } else if (token === "[") {
      while (tokens[cursor] !== "]") {
        value();
        if (tokens[cursor] === ",") cursor++;
      }
      cursor++;
    }
  }
  value();
  return parsed;
}
