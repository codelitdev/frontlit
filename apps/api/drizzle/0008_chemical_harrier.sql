DROP INDEX IF EXISTS "tickets_team_idx";--> statement-breakpoint
ALTER TABLE "ticket_messages" ALTER COLUMN "content" SET DATA TYPE jsonb USING "content"::jsonb;--> statement-breakpoint
ALTER TABLE "tickets" ALTER COLUMN "source" SET DEFAULT 'form';--> statement-breakpoint
ALTER TABLE "chatbot_settings" ADD COLUMN "escalation_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ticket_messages" ADD COLUMN "message_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "ticket_messages" ADD COLUMN "team_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tickets_team_status_idx" ON "tickets" USING btree ("team_id","status","last_message_at");--> statement-breakpoint
ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_message_id_unique" UNIQUE("message_id");--> statement-breakpoint
ALTER TABLE "ticket_messages" ADD CONSTRAINT "message_id_prefix_check" CHECK ("message_id" LIKE 'tmsg\_%' ESCAPE '\');