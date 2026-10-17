ALTER TABLE "media_upload_intents" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "media_upload_intents" CASCADE;--> statement-breakpoint
DROP INDEX IF EXISTS "media_team_medialit_idx";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "media_medialit_idx" ON "media" USING btree ("media_lit_id");--> statement-breakpoint
ALTER TABLE "documentation_revisions" DROP COLUMN IF EXISTS "asset_ids";--> statement-breakpoint
ALTER TABLE "media" DROP COLUMN IF EXISTS "provider_group";--> statement-breakpoint
ALTER TABLE "media" DROP COLUMN IF EXISTS "verified_at";--> statement-breakpoint
ALTER TABLE "media" DROP COLUMN IF EXISTS "access";