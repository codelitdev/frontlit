CREATE TABLE IF NOT EXISTS "git_assets" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"blob_sha" text NOT NULL,
	"url" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "page_pull_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"kind" text NOT NULL,
	"page_id" text,
	"branch" text NOT NULL,
	"base_sha" text NOT NULL,
	"commit_sha" text NOT NULL,
	"number" integer NOT NULL,
	"url" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"directory" text,
	"files" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "page_revisions" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"hash" text NOT NULL,
	"content" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "site_release_pages" (
	"release_id" text NOT NULL,
	"page_id" text,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"revision_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "site_releases" (
	"id" text PRIMARY KEY NOT NULL,
	"release_id" text NOT NULL,
	"team_id" text NOT NULL,
	"source" text NOT NULL,
	"commit_sha" text,
	"docs_publication_id" text,
	"site" jsonb NOT NULL,
	"summary" text,
	"source_key" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "site_releases_release_id_unique" UNIQUE("release_id"),
	CONSTRAINT "release_id_prefix_check" CHECK ("release_id" LIKE 'rel\_%' ESCAPE '\')
);
--> statement-breakpoint
ALTER TABLE "documentation_git_bindings" ADD COLUMN "docs_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "documentation_git_bindings" ADD COLUMN "pages_directory" text;--> statement-breakpoint
ALTER TABLE "documentation_git_bindings" ADD COLUMN "pages_source_key" text;--> statement-breakpoint
ALTER TABLE "documentation_git_bindings" ADD COLUMN "docs_source_key" text;--> statement-breakpoint
ALTER TABLE "documentation_git_bindings" ADD COLUMN "pages_diagnostics" jsonb;--> statement-breakpoint
ALTER TABLE "team_settings" ADD COLUMN "active_release_id" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "git_assets" ADD CONSTRAINT "git_assets_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "page_pull_requests" ADD CONSTRAINT "page_pull_requests_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "page_pull_requests" ADD CONSTRAINT "page_pull_requests_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "page_revisions" ADD CONSTRAINT "page_revisions_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "site_release_pages" ADD CONSTRAINT "site_release_pages_release_id_site_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."site_releases"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "site_release_pages" ADD CONSTRAINT "site_release_pages_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "site_release_pages" ADD CONSTRAINT "site_release_pages_revision_id_page_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."page_revisions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "site_releases" ADD CONSTRAINT "site_releases_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "git_assets_team_blob_idx" ON "git_assets" USING btree ("team_id","blob_sha");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "page_pull_requests_team_idx" ON "page_pull_requests" USING btree ("team_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "page_revisions_team_hash_idx" ON "page_revisions" USING btree ("team_id","hash");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "site_release_pages_slug_idx" ON "site_release_pages" USING btree ("release_id","slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "site_release_pages_page_idx" ON "site_release_pages" USING btree ("page_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "site_releases_team_idx" ON "site_releases" USING btree ("team_id","created_at");--> statement-breakpoint
ALTER TABLE "pages" DROP COLUMN IF EXISTS "layout";--> statement-breakpoint
ALTER TABLE "pages" DROP COLUMN IF EXISTS "title";--> statement-breakpoint
ALTER TABLE "pages" DROP COLUMN IF EXISTS "description";--> statement-breakpoint
ALTER TABLE "pages" DROP COLUMN IF EXISTS "social_image";--> statement-breakpoint
ALTER TABLE "pages" DROP COLUMN IF EXISTS "robots_allowed";--> statement-breakpoint
ALTER TABLE "pages" DROP COLUMN IF EXISTS "published_at";--> statement-breakpoint
ALTER TABLE "team_settings" DROP COLUMN IF EXISTS "shared_widgets";