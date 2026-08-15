/** Unicode NFKC, lowercase, trim, collapse internal whitespace. */
export function normalizeInboxText(value: string): string {
    return value
        .normalize("NFKC")
        .toLocaleLowerCase()
        .trim()
        .replace(/\s+/g, " ");
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Token-boundary phrase match against already-normalized haystack/needle. */
export function matchesNormalizedPhrase(
    haystack: string,
    phrase: string,
): boolean {
    if (!haystack || !phrase) return false;
    const pattern = escapeRegExp(phrase).replace(/ /g, "\\s+");
    return new RegExp(`(?:^|\\s)${pattern}(?:$|\\s)`).test(haystack);
}

export function findMatchingPhrase(
    haystackRaw: string,
    phrases: readonly string[],
): string | null {
    const haystack = normalizeInboxText(haystackRaw);
    for (const phrase of phrases) {
        const normalized = normalizeInboxText(phrase);
        if (normalized && matchesNormalizedPhrase(haystack, normalized)) {
            return normalized;
        }
    }
    return null;
}
