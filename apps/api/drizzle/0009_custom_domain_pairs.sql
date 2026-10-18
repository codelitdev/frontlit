CREATE TABLE IF NOT EXISTS "custom_domains" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"hostname" text NOT NULL,
	"primary" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"routing_satisfied" boolean,
	"verified_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "custom_domains_hostname_unique" UNIQUE("hostname"),
	CONSTRAINT "custom_domains_verified_at_check" CHECK (("status" <> 'verified' OR "verified_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "teams" DROP CONSTRAINT "teams_custom_domain_unique";--> statement-breakpoint
ALTER TABLE "teams" DROP CONSTRAINT "teams_custom_domain_state_check";--> statement-breakpoint
ALTER TABLE "teams" DROP CONSTRAINT "teams_subdomain_public_check";--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "redirect_subdomain" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "hide_from_search" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "teams" ALTER COLUMN "hide_from_search" SET DEFAULT true;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "custom_domains" ADD CONSTRAINT "custom_domains_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "custom_domains_team_idx" ON "custom_domains" USING btree ("team_id");--> statement-breakpoint
INSERT INTO "custom_domains" ("id", "team_id", "hostname", "primary", "status", "routing_satisfied", "verified_at")
SELECT gen_random_uuid()::text, "id", "custom_domain", true, "custom_domain_status", "custom_domain_routing_satisfied", "custom_domain_verified_at"
FROM "teams" WHERE "custom_domain" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "teams" DROP COLUMN IF EXISTS "subdomain_public";--> statement-breakpoint
ALTER TABLE "teams" DROP COLUMN IF EXISTS "custom_domain";--> statement-breakpoint
ALTER TABLE "teams" DROP COLUMN IF EXISTS "custom_domain_status";--> statement-breakpoint
ALTER TABLE "teams" DROP COLUMN IF EXISTS "custom_domain_verified_at";--> statement-breakpoint
ALTER TABLE "teams" DROP COLUMN IF EXISTS "custom_domain_routing_satisfied";