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
            Object.entries(value).map(([key, item]) => [
                key,
                serializeStructuredValue(item),
            ]),
        );
    }
    return value;
}

export function jsonResult(data: unknown) {
    const serialized = serializeStructuredValue(data ?? {}) as Record<
        string,
        unknown
    >;
    return {
        content: [{ type: "text" as const, text: JSON.stringify(serialized) }],
        structuredContent: serialized,
    };
}
