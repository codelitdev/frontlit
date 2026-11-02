CREATE TABLE IF NOT EXISTS "redirect_domains" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"hostname" text NOT NULL,
	"path_prefix" text DEFAULT '' NOT NULL,
	"rules" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"verification_token" text NOT NULL,
	"txt_satisfied" boolean,
	"routing_satisfied" boolean,
	"status" text DEFAULT 'pending' NOT NULL,
	"verified_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "redirect_domains_hostname_unique" UNIQUE("hostname"),
	CONSTRAINT "redirect_domains_verified_at_check" CHECK (("status" <> 'verified' OR "verified_at" IS NOT NULL))
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "redirect_domains" ADD CONSTRAINT "redirect_domains_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "redirect_domains_team_idx" ON "redirect_domains" USING btree ("team_id");