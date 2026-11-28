export const AUTH_ERROR = {
  content: [
    {
      type: "text" as const,
      text: "Authentication required: valid credentials were not provided.",
    },
  ],
  isError: true,
};

export const INTERNAL_ERROR = {
  content: [
    {
      type: "text" as const,
      text: "An error occurred while processing your request.",
    },
  ],
  isError: true,
};

export const NOT_FOUND = {
  content: [{ type: "text" as const, text: "Not found." }],
  isError: true,
};

export function errorResult(message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true,
  };
}

function serializeStructuredValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serializeStructuredValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, serializeStructuredValue(item)]),
    );
  }
  return value;
}

export function jsonResult(data: unknown) {
  const serialized = serializeStructuredValue(data ?? {}) as Record<string, unknown>;
  return {
    content: [{ type: "text" as const, text: JSON.stringify(serialized) }],
    structuredContent: serialized,
  };
}

/**
 * A result whose main payload is text an agent edits with exact-match
 * `old_str` values (editable Markdown, a page file). The text goes in its
 * own content block, verbatim: inside the JSON block it would be escaped a
 * second time. The JSON block holds the other fields; `structuredContent`
 * holds everything, the text under `textKey`.
 */
export function editableTextResult(
  data: Record<string, unknown>,
  textKey: string,
  text: string,
) {
  const serialized = serializeStructuredValue(data) as Record<string, unknown>;
  return {
    content: [
      { type: "text" as const, text: JSON.stringify(serialized) },
      { type: "text" as const, text },
    ],
    structuredContent: { ...serialized, [textKey]: text },
  };
}
