CREATE TABLE IF NOT EXISTS "media" (
	"id" text PRIMARY KEY NOT NULL,
	"media_id" text NOT NULL,
	"team_id" text NOT NULL,
	"media_lit_id" text NOT NULL,
	"url" text NOT NULL,
	"thumbnail_url" text,
	"file_name" text,
	"mime_type" text,
	"size" integer,
	"alt" text,
	"caption" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "media_media_id_unique" UNIQUE("media_id"),
	CONSTRAINT "media_id_prefix_check" CHECK ("media_id" LIKE 'med\_%' ESCAPE '\')
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "media" ADD CONSTRAINT "media_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "media_team_idx" ON "media" USING btree ("team_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "media_team_medialit_idx" ON "media" USING btree ("team_id","media_lit_id");