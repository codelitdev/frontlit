const MAX_EDITABLE_SLUG_LENGTH = 200;

export class InvalidSlugError extends Error {}
export class SlugConflictError extends Error {}

/** Lowercase, hyphenated slug from a human name/title. Empty input (e.g. a
 * page's homepage) yields an empty slug, which is a valid, reserved route. */
export function slugify(name: string): string {
    return name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

/** Normalizes an explicit user-supplied slug. Unlike generated homepage
 * slugs, editable slugs must resolve to a non-empty URL segment. */
export function normalizeEditableSlug(value: string): string {
    const normalized = slugify(value);
    if (!normalized || normalized.length > MAX_EDITABLE_SLUG_LENGTH) {
        throw new InvalidSlugError(
            "Slug must contain at least one letter or number and be 200 characters or fewer.",
        );
    }
    return normalized;
}

/** PostgreSQL and PGlite both surface unique-index races with SQLSTATE
 * 23505. Drizzle may expose it directly or through `cause`. */
export function isUniqueConstraintViolation(error: unknown): boolean {
    let current: unknown = error;
    for (
        let depth = 0;
        depth < 3 && current && typeof current === "object";
        depth += 1
    ) {
        if ("code" in current && current.code === "23505") return true;
        current = "cause" in current ? current.cause : undefined;
    }
    return false;
}

/** Appends a short numeric suffix until `isTaken` reports the candidate is
 * free. Shared by pages and documents, whose uniqueness scopes differ
 * (`(teamId, slug)` vs `(teamId, kind, slug)`), so the caller supplies the
 * check rather than this helper owning any table knowledge. */
export async function uniqueSlug(
    base: string,
    isTaken: (candidate: string) => Promise<boolean>,
): Promise<string> {
    let candidate = base;
    let attempt = 1;
    while (await isTaken(candidate)) {
        attempt += 1;
        candidate = `${base}-${attempt}`;
    }
    return candidate;
}
