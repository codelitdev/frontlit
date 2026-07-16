CREATE TABLE IF NOT EXISTS "domains" (
	"id" text PRIMARY KEY NOT NULL,
	"domain_id" text NOT NULL,
	"team_id" text NOT NULL,
	"hostname" text NOT NULL,
	"verification_token" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"verified_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "domains_domain_id_unique" UNIQUE("domain_id"),
	CONSTRAINT "domains_hostname_unique" UNIQUE("hostname"),
	CONSTRAINT "domain_id_prefix_check" CHECK ("domain_id" LIKE 'dom\_%' ESCAPE '\')
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "integrations" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"provider" text NOT NULL,
	"config" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "team_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"title" text,
	"subtitle" text,
	"logo" jsonb,
	"code_injection_head" text,
	"code_injection_body" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "team_settings_team_id_unique" UNIQUE("team_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ticket_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"ticket_id" text NOT NULL,
	"author" text NOT NULL,
	"author_account_id" text,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tickets" (
	"id" text PRIMARY KEY NOT NULL,
	"ticket_id" text NOT NULL,
	"team_id" text NOT NULL,
	"subject" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"requester_email" text NOT NULL,
	"requester_name" text,
	"source" text DEFAULT 'widget' NOT NULL,
	"access_token_hash" text NOT NULL,
	"assignee_account_id" text,
	"last_message_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tickets_ticket_id_unique" UNIQUE("ticket_id"),
	CONSTRAINT "ticket_id_prefix_check" CHECK ("ticket_id" LIKE 'tkt\_%' ESCAPE '\')
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "domains" ADD CONSTRAINT "domains_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "integrations" ADD CONSTRAINT "integrations_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_settings" ADD CONSTRAINT "team_settings_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_author_account_id_accounts_id_fk" FOREIGN KEY ("author_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tickets" ADD CONSTRAINT "tickets_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tickets" ADD CONSTRAINT "tickets_assignee_account_id_accounts_id_fk" FOREIGN KEY ("assignee_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "domains_team_idx" ON "domains" USING btree ("team_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "integrations_team_provider_idx" ON "integrations" USING btree ("team_id","provider");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ticket_messages_ticket_idx" ON "ticket_messages" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tickets_team_idx" ON "tickets" USING btree ("team_id","status");