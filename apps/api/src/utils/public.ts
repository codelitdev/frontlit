/** Strips the internal surrogate `id` (and any other internal-only keys)
 * from a DB row before it's sent in an API/MCP response. */
export function omitInternal<
    T extends Record<string, unknown>,
    K extends keyof T,
>(row: T, ...keys: K[]): Omit<T, K | "id"> {
    const clone: Record<string, unknown> = { ...row };
    delete clone.id;
    for (const key of keys) delete clone[key as string];
    return clone as Omit<T, K | "id">;
}

type WithDatesAsStrings<T> = {
    [K in keyof T]: T[K] extends Date | null
        ? string | Extract<T[K], null>
        : T[K] extends Date
          ? string
          : T[K];
};

/** Converts Date-typed columns (createdAt/updatedAt) to ISO strings for the
 * wire format, since Drizzle returns real `Date` objects. */
export function serializeDates<T extends Record<string, unknown>>(
    row: T,
): WithDatesAsStrings<T> {
    const clone: Record<string, unknown> = { ...row };
    for (const key of Object.keys(clone)) {
        if (clone[key] instanceof Date) {
            clone[key] = (clone[key] as Date).toISOString();
        }
    }
    return clone as WithDatesAsStrings<T>;
}
