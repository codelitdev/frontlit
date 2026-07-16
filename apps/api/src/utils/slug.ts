/** Lowercase, hyphenated slug from a human name/title. Empty input (e.g. a
 * page's homepage) yields an empty slug, which is a valid, reserved route. */
export function slugify(name: string): string {
    return name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

/** Appends a short numeric suffix until `isTaken` reports the candidate is
 * free. Shared by pages and documents, whose uniqueness scopes differ
 * (`(teamId, slug)` vs `(teamId, kind, slug)`), so the caller supplies the
 * check rather than this helper owning any table knowledge. */
export async function uniqueSlug(base: string, isTaken: (candidate: string) => Promise<boolean>): Promise<string> {
    let candidate = base;
    let attempt = 1;
    while (await isTaken(candidate)) {
        attempt += 1;
        candidate = `${base}-${attempt}`;
    }
    return candidate;
}
