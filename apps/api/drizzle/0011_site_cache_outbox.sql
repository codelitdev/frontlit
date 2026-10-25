CREATE TABLE IF NOT EXISTS "site_cache_outbox" (
	"event_id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"tags" jsonb NOT NULL,
	"invalidate_hosts" jsonb,
	"destinations" jsonb NOT NULL,
	"acknowledgments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp DEFAULT now() NOT NULL,
	"lease_token" text,
	"lease_expires_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "site_cache_outbox" ADD CONSTRAINT "site_cache_outbox_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "site_cache_outbox_poll_idx" ON "site_cache_outbox" USING btree ("completed_at","next_attempt_at");