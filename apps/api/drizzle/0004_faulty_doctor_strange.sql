CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "doc_sections" (
	"id" text PRIMARY KEY NOT NULL,
	"section_id" text NOT NULL,
	"team_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "doc_sections_section_id_unique" UNIQUE("section_id"),
	CONSTRAINT "section_id_prefix_check" CHECK ("section_id" LIKE 'sec\_%' ESCAPE '\')
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "document_chunks" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"document_id" text NOT NULL,
	"heading" text,
	"anchor" text,
	"content" text NOT NULL,
	"embedding" vector(1536) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "doc_sections" ADD CONSTRAINT "doc_sections_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "document_chunks" ADD CONSTRAINT "document_chunks_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "document_chunks" ADD CONSTRAINT "document_chunks_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "doc_sections_team_slug_idx" ON "doc_sections" USING btree ("team_id","slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "doc_sections_team_idx" ON "doc_sections" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_chunks_team_idx" ON "document_chunks" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_chunks_embedding_idx" ON "document_chunks" USING hnsw ("embedding" vector_cosine_ops);