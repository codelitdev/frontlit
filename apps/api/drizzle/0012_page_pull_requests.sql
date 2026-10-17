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
	"files" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
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
CREATE INDEX IF NOT EXISTS "page_pull_requests_team_idx" ON "page_pull_requests" USING btree ("team_id","created_at");