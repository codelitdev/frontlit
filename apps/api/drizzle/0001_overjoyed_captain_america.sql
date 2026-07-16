-- Draft/publish support for pages (architecture.md §4). Columns are added
-- nullable/defaulted first, backfilled from existing data, then constrained
-- — safe to run against a table that already has rows.

ALTER TABLE "pages" ADD COLUMN "slug" text;
--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "deleteable" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "published_at" timestamp;
--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "draft_layout" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "draft_title" text;
--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "draft_description" text;
--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "draft_social_image" jsonb;
--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "draft_robots_allowed" boolean;
--> statement-breakpoint

-- Backfill: existing pages are considered already published, and their
-- current layout/SEO fields become both the published and draft state.
UPDATE "pages" SET
    "draft_layout" = "layout",
    "draft_title" = "title",
    "draft_description" = "description",
    "draft_social_image" = "social_image",
    "draft_robots_allowed" = "robots_allowed",
    "published_at" = "updated_at"
WHERE "published_at" IS NULL;
--> statement-breakpoint

-- Slugs: derive from the page name, lowercased/hyphenated, uniquified per
-- team by appending the row's own id suffix on collision.
UPDATE "pages" SET "slug" = lower(regexp_replace(regexp_replace(trim("name"), '[^a-zA-Z0-9]+', '-', 'g'), '^-+|-+$', '', 'g'))
WHERE "slug" IS NULL;
--> statement-breakpoint

UPDATE "pages" p SET "slug" = p."slug" || '-' || right(p."page_id", 6)
WHERE "slug" IS NOT NULL AND EXISTS (
    SELECT 1 FROM "pages" p2
    WHERE p2."team_id" = p."team_id" AND p2."slug" = p."slug" AND p2."id" != p."id"
);
--> statement-breakpoint

ALTER TABLE "pages" ALTER COLUMN "slug" SET NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "pages_team_slug_idx" ON "pages" USING btree ("team_id","slug");
