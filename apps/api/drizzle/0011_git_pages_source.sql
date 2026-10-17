CREATE TABLE IF NOT EXISTS "git_assets" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"blob_sha" text NOT NULL,
	"url" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "documentation_git_bindings" ADD COLUMN "docs_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "documentation_git_bindings" ADD COLUMN "pages_directory" text;--> statement-breakpoint
ALTER TABLE "documentation_git_bindings" ADD COLUMN "pages_source_key" text;--> statement-breakpoint
ALTER TABLE "documentation_git_bindings" ADD COLUMN "docs_source_key" text;--> statement-breakpoint
ALTER TABLE "documentation_git_bindings" ADD COLUMN "pages_diagnostics" jsonb;--> statement-breakpoint
ALTER TABLE "site_releases" ADD COLUMN "source_key" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "git_assets" ADD CONSTRAINT "git_assets_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "git_assets_team_blob_idx" ON "git_assets" USING btree ("team_id","blob_sha");