ALTER TABLE "pages" DROP COLUMN IF EXISTS "layout";--> statement-breakpoint
ALTER TABLE "pages" DROP COLUMN IF EXISTS "title";--> statement-breakpoint
ALTER TABLE "pages" DROP COLUMN IF EXISTS "description";--> statement-breakpoint
ALTER TABLE "pages" DROP COLUMN IF EXISTS "social_image";--> statement-breakpoint
ALTER TABLE "pages" DROP COLUMN IF EXISTS "robots_allowed";--> statement-breakpoint
ALTER TABLE "pages" DROP COLUMN IF EXISTS "published_at";--> statement-breakpoint
ALTER TABLE "team_settings" DROP COLUMN IF EXISTS "shared_widgets";
