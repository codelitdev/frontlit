CREATE TABLE IF NOT EXISTS "documents" (
	"id" text PRIMARY KEY NOT NULL,
	"document_id" text NOT NULL,
	"team_id" text NOT NULL,
	"kind" text NOT NULL,
	"slug" text NOT NULL,
	"title" text,
	"content" jsonb,
	"excerpt" text,
	"featured_image" jsonb,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"published_at" timestamp,
	"draft_title" text NOT NULL,
	"draft_content" jsonb NOT NULL,
	"draft_excerpt" text,
	"draft_featured_image" jsonb,
	"draft_meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"author_account_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "documents_document_id_unique" UNIQUE("document_id"),
	CONSTRAINT "document_id_prefix_check" CHECK ("document_id" LIKE 'doc\_%' ESCAPE '\')
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documents" ADD CONSTRAINT "documents_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documents" ADD CONSTRAINT "documents_author_account_id_accounts_id_fk" FOREIGN KEY ("author_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "documents_team_kind_slug_idx" ON "documents" USING btree ("team_id","kind","slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documents_team_kind_idx" ON "documents" USING btree ("team_id","kind");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documents_published_idx" ON "documents" USING btree ("team_id","kind","published_at");