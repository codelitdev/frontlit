/** Page `socialImage` stays a loose media reference (page JSON files and the
 * builder both write it). A string is a URL; an object needs a url, which
 * may arrive as `file` or `src`. */
export function normalizeSocialImage(input: unknown): Record<string, unknown> | null {
  if (!input) return null;
  if (typeof input === "string") {
    const url = input.trim();
    return url ? { url } : null;
  }
  if (typeof input !== "object") return null;
  const obj = input as Record<string, unknown>;
  const url = [obj.url, obj.file, obj.src].find(
    (value): value is string => typeof value === "string" && value.trim() !== "",
  );
  return url ? { ...obj, url: url.trim() } : null;
}
