CREATE TABLE IF NOT EXISTS "search_chunks" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"kind" text NOT NULL,
	"source_id" text NOT NULL,
	"revision_id" text,
	"source_hash" text NOT NULL,
	"position" integer NOT NULL,
	"slug" text NOT NULL,
	"title" text,
	"heading" text,
	"anchor" text,
	"context" text DEFAULT '' NOT NULL,
	"content" text NOT NULL,
	"search_text" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('english', coalesce(title, '') || ' ' || coalesce(heading, '')), 'A') || setweight(to_tsvector('english', content), 'B') || setweight(to_tsvector('english', context), 'C')) STORED,
	"embedding" vector(1536),
	"embedding_model" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "search_index_requests" (
	"team_id" text PRIMARY KEY NOT NULL,
	"requested_at" timestamp DEFAULT now() NOT NULL,
	"next_attempt_at" timestamp DEFAULT now() NOT NULL,
	"lease_expires_at" timestamp,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text
);
--> statement-breakpoint
ALTER TABLE "ticket_messages" ADD COLUMN "feedback" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "search_chunks" ADD CONSTRAINT "search_chunks_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "search_index_requests" ADD CONSTRAINT "search_index_requests_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "search_chunks_source_idx" ON "search_chunks" USING btree ("team_id","kind","source_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "search_chunks_text_idx" ON "search_chunks" USING gin ("search_text");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "search_chunks_embedding_idx" ON "search_chunks" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
DROP TABLE "document_chunks" CASCADE;--> statement-breakpoint
DROP TABLE "document_index_jobs" CASCADE;--> statement-breakpoint
DROP TABLE "documentation_embedding_configs" CASCADE;--> statement-breakpoint
DROP TABLE "documentation_embeddings" CASCADE;--> statement-breakpoint
-- Index every existing team's published content on the next worker pass.
INSERT INTO "search_index_requests" ("team_id", "requested_at", "next_attempt_at") SELECT "id", timezone('utc', now()), timezone('utc', now()) FROM "teams" ON CONFLICT DO NOTHING;
