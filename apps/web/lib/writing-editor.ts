export function parseTags(value: string): string[] {
    const seen = new Set<string>();
    const tags: string[] = [];

    for (const candidate of value.split(",")) {
        const tag = candidate.trim();
        const key = tag.toLowerCase();
        if (!tag || seen.has(key)) continue;
        seen.add(key);
        tags.push(tag);
    }

    return tags;
}

export function formatSavedAt(value: string | null | undefined, now = Date.now()): string {
    if (!value) return "Not saved yet";

    const elapsedSeconds = Math.max(0, Math.floor((now - new Date(value).getTime()) / 1000));
    if (elapsedSeconds < 30) return "Saved just now";
    if (elapsedSeconds < 3600) return `Saved ${Math.max(1, Math.floor(elapsedSeconds / 60))}m ago`;
    if (elapsedSeconds < 86400) return `Saved ${Math.floor(elapsedSeconds / 3600)}h ago`;
    return `Saved ${Math.floor(elapsedSeconds / 86400)}d ago`;
}
