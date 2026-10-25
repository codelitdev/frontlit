CREATE TABLE IF NOT EXISTS "documentation_api_operations" (
	"spec_id" text NOT NULL,
	"team_id" text NOT NULL,
	"route" text NOT NULL,
	"title" text NOT NULL,
	"group" text NOT NULL,
	"order" integer NOT NULL,
	"method" text NOT NULL,
	"path" text NOT NULL,
	"deprecated" boolean DEFAULT false NOT NULL,
	"slice" text NOT NULL,
	"chunks" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "documentation_api_specs" (
	"spec_id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"status" text NOT NULL,
	"commit_sha" text NOT NULL,
	"source_path" text NOT NULL,
	"source_blob_sha" text,
	"mount" text NOT NULL,
	"spec" text,
	"spec_hash" text,
	"info" jsonb,
	"diagnostics" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "documentation_git_bindings" ADD COLUMN "api_spec_path" text;--> statement-breakpoint
ALTER TABLE "documentation_git_bindings" ADD COLUMN "api_mount" text DEFAULT 'api-reference' NOT NULL;--> statement-breakpoint
ALTER TABLE "documentation_settings" ADD COLUMN "active_api_spec_id" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documentation_api_operations" ADD CONSTRAINT "documentation_api_operations_spec_id_documentation_api_specs_spec_id_fk" FOREIGN KEY ("spec_id") REFERENCES "public"."documentation_api_specs"("spec_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documentation_api_operations" ADD CONSTRAINT "documentation_api_operations_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documentation_api_specs" ADD CONSTRAINT "documentation_api_specs_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "documentation_api_operations_route_idx" ON "documentation_api_operations" USING btree ("spec_id","route");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documentation_api_operations_team_idx" ON "documentation_api_operations" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documentation_api_specs_team_idx" ON "documentation_api_specs" USING btree ("team_id","status");