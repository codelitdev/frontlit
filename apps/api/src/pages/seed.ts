import { db } from "../db/client";
import { genId } from "../db/id";
import { pages, type WidgetInstanceRow } from "../db/schema";
import { createRequiredSharedWidgetPlaceholders } from "./shared-widgets";

const STANDARD_PAGES: { name: string; slug: string; type: "site" | "blog" | "custom"; layout?: WidgetInstanceRow[] }[] = [
    { name: "Homepage", slug: "", type: "site" },
    { name: "Blog", slug: "blog", type: "blog" },
    { name: "Changelog", slug: "changelog", type: "custom" },
    { name: "Docs", slug: "docs", type: "custom" },
    {
        name: "Help desk",
        slug: "help",
        type: "custom",
        // Pre-placed so the seeded page works out of the box (architecture.md
        // §4.2/§11.2) — matches `@frontlit/page-builder`'s `support-form`
        // block shape, hand-built here rather than imported so apps/api never
        // pulls in the page-builder's browser/React dependency graph (same
        // rule as documents' opaque TipTap JSON, §5.1).
        layout: [{ widgetId: genId(), name: "support-form", deleteable: true, shared: false, settings: {} }],
    },
    { name: "Terms of Service", slug: "terms", type: "custom" },
    { name: "Privacy policy", slug: "privacy", type: "custom" },
];

/** Seeds the standard, non-deleteable pages every team needs at creation
 * (architecture.md §4.2) — same builder, same draft/publish flow, just
 * reserved slugs. Published immediately so the site renders something from
 * day one instead of 404ing. */
export async function seedStandardPages(teamId: string) {
    const now = new Date();
    await db.insert(pages).values(
        STANDARD_PAGES.map((p) => {
            const [header, footer] = createRequiredSharedWidgetPlaceholders();
            const layout = [header, ...(p.layout ?? []), footer];
            return {
                teamId,
                name: p.name,
                type: p.type,
                slug: p.slug,
                deleteable: false,
                layout,
                draftLayout: layout,
                publishedAt: now,
            };
        }),
    );
}
