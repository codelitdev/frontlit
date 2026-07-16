CREATE TABLE IF NOT EXISTS "chatbot_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"name" text DEFAULT 'Assistant' NOT NULL,
	"greeting" text,
	"accent_color" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "chatbot_settings_team_id_unique" UNIQUE("team_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "chatbot_settings" ADD CONSTRAINT "chatbot_settings_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
