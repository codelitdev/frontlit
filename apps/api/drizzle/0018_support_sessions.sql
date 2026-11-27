CREATE TABLE IF NOT EXISTS "support_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"requester_email" text NOT NULL,
	"requester_name" text,
	"requester_external_id" text,
	"requester_account" jsonb,
	"context" jsonb,
	"message" text,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "support_sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "scope" text DEFAULT 'full' NOT NULL;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "requester_external_id" text;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "requester_account" jsonb;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "contact_id" text;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "context" jsonb;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "support_sessions" ADD CONSTRAINT "support_sessions_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "support_sessions_team_idx" ON "support_sessions" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tickets_team_external_id_idx" ON "tickets" USING btree ("team_id","requester_external_id");