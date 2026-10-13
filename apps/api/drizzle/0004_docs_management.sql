CREATE TABLE IF NOT EXISTS "documentation_settings" (
	"team_id" text PRIMARY KEY NOT NULL,
	"source" text DEFAULT 'editor' NOT NULL,
	"draft_version" integer DEFAULT 1 NOT NULL,
	"active_publication_id" text,
	"indexing" jsonb DEFAULT '{"enabled":true}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "media_upload_intents" (
	"intent_id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"provider_group" text NOT NULL,
	"media_lit_id" text,
	"expires_at" timestamp NOT NULL,
	CONSTRAINT "media_upload_intents_provider_group_unique" UNIQUE("provider_group")
);
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "draft_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "draft_slug" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "draft_markdown" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "draft_hash" text;--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "provider_group" text;--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "verified_at" timestamp;--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "access" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documentation_settings" ADD CONSTRAINT "documentation_settings_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "media_upload_intents" ADD CONSTRAINT "media_upload_intents_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint
UPDATE documents SET draft_slug = slug WHERE kind = 'doc';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "documentation_delivery_outbox" (
	"event_id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"publication_id" text,
	"policy_epoch" integer NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"destinations" jsonb DEFAULT '["local"]'::jsonb NOT NULL,
	"acknowledgments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp DEFAULT now() NOT NULL,
	"lease_token" text,
	"lease_expires_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "documentation_memberships" (
	"publication_id" text NOT NULL,
	"document_id" text NOT NULL,
	"revision_id" text NOT NULL,
	"route" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "documentation_publications" (
	"publication_id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"input_hash" text NOT NULL,
	"base_publication_id" text,
	"source" text NOT NULL,
	"generation" integer NOT NULL,
	"purge_generation" integer NOT NULL,
	"docs_draft_version" integer NOT NULL,
	"indexing" jsonb NOT NULL,
	"navigation" jsonb NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"diagnostics" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"lease_token" text,
	"lease_expires_at" timestamp,
	"next_attempt_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"activated_at" timestamp,
	"finished_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "documentation_purges" (
	"purge_id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"plan_hash" text NOT NULL,
	"manifest" jsonb NOT NULL,
	"actor_account_id" text,
	"idempotency_key" text,
	"status" text DEFAULT 'preflight' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "documentation_revisions" (
	"revision_id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"document_id" text NOT NULL,
	"hash" text NOT NULL,
	"schema_version" text DEFAULT 'docs-v1' NOT NULL,
	"snapshot" jsonb NOT NULL,
	"markdown" text NOT NULL,
	"headings" jsonb NOT NULL,
	"chunks" jsonb NOT NULL,
	"asset_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX IF EXISTS "documents_team_kind_slug_idx";--> statement-breakpoint
ALTER TABLE "documentation_settings" ADD COLUMN "requested_generation" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "documentation_settings" ADD COLUMN "policy_epoch" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "documentation_settings" ADD COLUMN "purge_generation" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documentation_delivery_outbox" ADD CONSTRAINT "documentation_delivery_outbox_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documentation_memberships" ADD CONSTRAINT "documentation_memberships_publication_id_documentation_publications_publication_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."documentation_publications"("publication_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documentation_memberships" ADD CONSTRAINT "documentation_memberships_revision_id_documentation_revisions_revision_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."documentation_revisions"("revision_id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documentation_publications" ADD CONSTRAINT "documentation_publications_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documentation_purges" ADD CONSTRAINT "documentation_purges_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documentation_revisions" ADD CONSTRAINT "documentation_revisions_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "documentation_memberships_route_idx" ON "documentation_memberships" USING btree ("publication_id","route");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "documentation_memberships_document_idx" ON "documentation_memberships" USING btree ("publication_id","document_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "documentation_publications_idempotency_idx" ON "documentation_publications" USING btree ("team_id","idempotency_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documentation_publications_poll_idx" ON "documentation_publications" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "documentation_purges_idempotency_idx" ON "documentation_purges" USING btree ("team_id","idempotency_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documentation_revisions_team_idx" ON "documentation_revisions" USING btree ("team_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "documents_team_kind_slug_idx" ON "documents" USING btree ("team_id","kind","slug") WHERE "documents"."kind" <> 'doc';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "documentation_embeddings" (
	"revision_id" text NOT NULL,
	"config_hash" text NOT NULL,
	"vectors" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "documentation_evidence" (
	"evidence_id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"item_id" text NOT NULL,
	"ticket_id" text NOT NULL,
	"message_id" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"trigger" text NOT NULL,
	"retrieved" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "documentation_improvement_drafts" (
	"item_id" text NOT NULL,
	"approved_version" integer NOT NULL,
	"item_version" integer NOT NULL,
	"idempotency_key" text NOT NULL,
	"input_hash" text NOT NULL,
	"document_id" text NOT NULL,
	"draft_version" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "documentation_improvements" (
	"item_id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"state" text DEFAULT 'open' NOT NULL,
	"group_key" text NOT NULL,
	"reason" text NOT NULL,
	"target_document_id" text,
	"predecessor_id" text,
	"merged_into_id" text,
	"approved" jsonb,
	"draft_document_id" text,
	"draft_version" integer,
	"draft_hash" text,
	"revision_id" text,
	"publication_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documentation_embeddings" ADD CONSTRAINT "documentation_embeddings_revision_id_documentation_revisions_revision_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."documentation_revisions"("revision_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documentation_evidence" ADD CONSTRAINT "documentation_evidence_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documentation_evidence" ADD CONSTRAINT "documentation_evidence_item_id_documentation_improvements_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."documentation_improvements"("item_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documentation_evidence" ADD CONSTRAINT "documentation_evidence_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documentation_evidence" ADD CONSTRAINT "documentation_evidence_message_id_ticket_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."ticket_messages"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documentation_improvement_drafts" ADD CONSTRAINT "documentation_improvement_drafts_item_id_documentation_improvements_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."documentation_improvements"("item_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documentation_improvements" ADD CONSTRAINT "documentation_improvements_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "documentation_embeddings_revision_config_idx" ON "documentation_embeddings" USING btree ("revision_id","config_hash");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "documentation_evidence_dedupe_idx" ON "documentation_evidence" USING btree ("team_id","dedupe_key");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "documentation_improvement_drafts_version_idx" ON "documentation_improvement_drafts" USING btree ("item_id","approved_version");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documentation_improvements_team_idx" ON "documentation_improvements" USING btree ("team_id","created_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "documentation_embedding_configs" (
	"config_hash" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"provider" text NOT NULL,
	"deployment" text,
	"endpoint" text,
	"encrypted_api_key" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documentation_embedding_configs" ADD CONSTRAINT "documentation_embedding_configs_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "documentation_improvement_reviews" (
	"review_id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"item_id" text NOT NULL,
	"actor_account_id" text NOT NULL,
	"item_version" integer NOT NULL,
	"action" text NOT NULL,
	"input" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documentation_improvement_reviews" ADD CONSTRAINT "documentation_improvement_reviews_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documentation_improvement_reviews" ADD CONSTRAINT "documentation_improvement_reviews_item_id_documentation_improvements_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."documentation_improvements"("item_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documentation_improvement_reviews_item_idx" ON "documentation_improvement_reviews" USING btree ("team_id","item_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "documentation_git_bindings" (
	"team_id" text PRIMARY KEY NOT NULL,
	"installation_id" text NOT NULL,
	"repository_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"owner_login" text NOT NULL,
	"repository_name" text NOT NULL,
	"repository_private" boolean NOT NULL,
	"branch" text NOT NULL,
	"directory" text NOT NULL,
	"status" text NOT NULL,
	"generation" integer DEFAULT 1 NOT NULL,
	"requested_generation" integer DEFAULT 0 NOT NULL,
	"grant_version" integer DEFAULT 1 NOT NULL,
	"grant_actor_account_id" text NOT NULL,
	"grant_github_user_id" text NOT NULL,
	"repository_admin_verified" boolean NOT NULL,
	"capabilities" jsonb NOT NULL,
	"granted_at" timestamp DEFAULT now() NOT NULL,
	"observed_sha" text,
	"validated_sha" text,
	"live_sha" text,
	"last_successful_sync_at" timestamp,
	"last_diagnostic" text,
	"next_reconcile_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "documentation_git_deliveries" (
	"delivery_id" text PRIMARY KEY NOT NULL,
	"event" text NOT NULL,
	"installation_id" text,
	"repository_id" text,
	"received_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "documentation_git_files" (
	"team_id" text NOT NULL,
	"source_path" text NOT NULL,
	"document_id" text NOT NULL,
	"commit_sha" text NOT NULL,
	"blob_sha" text NOT NULL,
	"source_hash" text NOT NULL,
	"markdown" text NOT NULL,
	"frontmatter" jsonb NOT NULL,
	"snapshot" jsonb NOT NULL,
	"removed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "documentation_git_jobs" (
	"run_id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"connection_generation" integer NOT NULL,
	"request_generation" integer NOT NULL,
	"reviewed_sha" text,
	"observed_sha" text,
	"publication_id" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"diagnostic" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp DEFAULT now() NOT NULL,
	"lease_token" text,
	"lease_expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "documentation_git_migrations" (
	"plan_id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"setup_id" text NOT NULL,
	"actor_account_id" text NOT NULL,
	"preflight_id" text,
	"docs_draft_version" integer NOT NULL,
	"active_publication_id" text,
	"plan_hash" text NOT NULL,
	"files" jsonb NOT NULL,
	"sections" jsonb NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	"verified_sha" text,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"activated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "documentation_git_preflights" (
	"preflight_id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"setup_id" text NOT NULL,
	"installation_id" text NOT NULL,
	"repository_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"owner_login" text NOT NULL,
	"repository_name" text NOT NULL,
	"repository_private" boolean NOT NULL,
	"branch" text NOT NULL,
	"directory" text NOT NULL,
	"commit_sha" text NOT NULL,
	"docs_draft_version" integer NOT NULL,
	"manifest_hash" text NOT NULL,
	"manifest" jsonb NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "documentation_git_setups" (
	"setup_id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"actor_account_id" text NOT NULL,
	"state_hash" text NOT NULL,
	"encrypted_verifier" text,
	"encrypted_user_token" text,
	"github_user_id" text,
	"github_login" text,
	"purpose" text NOT NULL,
	"return_path" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "documentation_git_setups_state_hash_unique" UNIQUE("state_hash")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documentation_git_bindings" ADD CONSTRAINT "documentation_git_bindings_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documentation_git_files" ADD CONSTRAINT "documentation_git_files_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documentation_git_jobs" ADD CONSTRAINT "documentation_git_jobs_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documentation_git_migrations" ADD CONSTRAINT "documentation_git_migrations_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documentation_git_migrations" ADD CONSTRAINT "documentation_git_migrations_setup_id_documentation_git_setups_setup_id_fk" FOREIGN KEY ("setup_id") REFERENCES "public"."documentation_git_setups"("setup_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documentation_git_migrations" ADD CONSTRAINT "documentation_git_migrations_preflight_id_documentation_git_preflights_preflight_id_fk" FOREIGN KEY ("preflight_id") REFERENCES "public"."documentation_git_preflights"("preflight_id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documentation_git_preflights" ADD CONSTRAINT "documentation_git_preflights_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documentation_git_preflights" ADD CONSTRAINT "documentation_git_preflights_setup_id_documentation_git_setups_setup_id_fk" FOREIGN KEY ("setup_id") REFERENCES "public"."documentation_git_setups"("setup_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documentation_git_setups" ADD CONSTRAINT "documentation_git_setups_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documentation_git_setups" ADD CONSTRAINT "documentation_git_setups_actor_account_id_accounts_id_fk" FOREIGN KEY ("actor_account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documentation_git_bindings_installation_idx" ON "documentation_git_bindings" USING btree ("installation_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documentation_git_bindings_reconcile_idx" ON "documentation_git_bindings" USING btree ("status","next_reconcile_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "documentation_git_files_path_idx" ON "documentation_git_files" USING btree ("team_id","source_path");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "documentation_git_files_document_idx" ON "documentation_git_files" USING btree ("team_id","document_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "documentation_git_jobs_generation_idx" ON "documentation_git_jobs" USING btree ("team_id","connection_generation","request_generation");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documentation_git_jobs_poll_idx" ON "documentation_git_jobs" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documentation_git_migrations_team_idx" ON "documentation_git_migrations" USING btree ("team_id","expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documentation_git_preflights_team_idx" ON "documentation_git_preflights" USING btree ("team_id","expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documentation_git_setups_expiry_idx" ON "documentation_git_setups" USING btree ("expires_at");
--> statement-breakpoint
ALTER TABLE "documentation_git_bindings" ADD COLUMN "connection_receipt" jsonb;--> statement-breakpoint
ALTER TABLE "documentation_git_migrations" ADD COLUMN "selection" jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "documentation_publications" ADD COLUMN "git_context" jsonb;
--> statement-breakpoint
ALTER TABLE "documentation_git_deliveries" ADD COLUMN "action" text;--> statement-breakpoint
ALTER TABLE "documentation_git_deliveries" ADD COLUMN "outcome" text DEFAULT 'ignored' NOT NULL;--> statement-breakpoint
ALTER TABLE "documentation_git_deliveries" ADD COLUMN "run_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "documentation_git_deliveries" ADD COLUMN "payload" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "documentation_git_jobs" ADD COLUMN "trigger" text DEFAULT 'reconcile' NOT NULL;--> statement-breakpoint
ALTER TABLE "documentation_publications" ADD COLUMN "admission_type" text DEFAULT 'explicit' NOT NULL;--> statement-breakpoint
UPDATE "documentation_publications" SET "admission_type" = 'automatic' WHERE "source" = 'git' OR "idempotency_key" = 'bootstrap-v1' OR "idempotency_key" LIKE 'retrieval:%';
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "draft_git_source" jsonb;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "documentation_git_grants" (
	"grant_id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"input_hash" text NOT NULL,
	"actor_account_id" text NOT NULL,
	"github_user_id" text NOT NULL,
	"installation_id" text NOT NULL,
	"repository_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"branch" text NOT NULL,
	"directory" text NOT NULL,
	"grant_version" integer NOT NULL,
	"connection_generation" integer NOT NULL,
	"capabilities" jsonb NOT NULL,
	"repository_admin_verified" boolean NOT NULL,
	"granted_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documentation_git_grants" ADD CONSTRAINT "documentation_git_grants_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "documentation_git_grants_idempotency_idx" ON "documentation_git_grants" USING btree ("team_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "documentation_git_grants_version_idx" ON "documentation_git_grants" USING btree ("team_id","grant_version");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "documentation_git_proposal_documents" (
	"proposal_id" text NOT NULL,
	"team_id" text NOT NULL,
	"document_id" text NOT NULL,
	"draft_version" integer NOT NULL,
	"open" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "documentation_git_proposals" (
	"proposal_id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"input_hash" text NOT NULL,
	"actor_credential" jsonb NOT NULL,
	"connection_generation" integer NOT NULL,
	"grant_version" integer NOT NULL,
	"mode" text NOT NULL,
	"title" text NOT NULL,
	"changes" jsonb NOT NULL,
	"base_sha" text,
	"commit_sha" text,
	"branch" text,
	"pull_request_number" integer,
	"pull_request_url" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"diagnostics" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"lease_token" text,
	"lease_expires_at" timestamp,
	"next_attempt_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documentation_git_proposal_documents" ADD CONSTRAINT "documentation_git_proposal_documents_proposal_id_documentation_git_proposals_proposal_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."documentation_git_proposals"("proposal_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documentation_git_proposal_documents" ADD CONSTRAINT "documentation_git_proposal_documents_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documentation_git_proposals" ADD CONSTRAINT "documentation_git_proposals_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "documentation_git_proposal_documents_identity_idx" ON "documentation_git_proposal_documents" USING btree ("proposal_id","document_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "documentation_git_proposal_documents_open_idx" ON "documentation_git_proposal_documents" USING btree ("team_id","document_id") WHERE "documentation_git_proposal_documents"."open" = true;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "documentation_git_proposals_idempotency_idx" ON "documentation_git_proposals" USING btree ("team_id","idempotency_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documentation_git_proposals_poll_idx" ON "documentation_git_proposals" USING btree ("status","next_attempt_at");
--> statement-breakpoint
ALTER TABLE "documentation_git_proposal_documents" ADD COLUMN "source_path" text;--> statement-breakpoint
ALTER TABLE "documentation_git_proposal_documents" ADD COLUMN "target_path" text;--> statement-breakpoint
ALTER TABLE "documentation_git_proposals" ADD COLUMN "tree_sha" text;--> statement-breakpoint
UPDATE documentation_git_proposal_documents AS link
SET source_path = captured.item->'base'->>'sourcePath',
    target_path = captured.item->'target'->>'sourcePath'
FROM documentation_git_proposals AS proposal,
LATERAL jsonb_array_elements(proposal.changes) AS captured(item)
WHERE link.proposal_id = proposal.proposal_id
  AND link.document_id = captured.item->>'documentId';
--> statement-breakpoint
ALTER TABLE "documentation_git_proposals" ADD COLUMN "source_context" jsonb;--> statement-breakpoint
ALTER TABLE "documentation_git_proposals" ADD COLUMN "merged_commit_sha" text;
--> statement-breakpoint
UPDATE documentation_git_proposals p SET source_context = jsonb_build_object(
  'installationId', b.installation_id, 'repositoryId', b.repository_id,
  'ownerId', b.owner_id, 'branch', b.branch, 'directory', b.directory
) FROM documentation_git_bindings b WHERE p.team_id = b.team_id AND p.connection_generation = b.generation;
--> statement-breakpoint
UPDATE documentation_git_proposals SET merged_commit_sha = commit_sha WHERE mode = 'direct' AND status = 'merged';
--> statement-breakpoint
DROP INDEX IF EXISTS "documentation_git_files_document_idx";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "documentation_git_files_document_idx" ON "documentation_git_files" USING btree ("team_id","document_id") WHERE "documentation_git_files"."removed_at" is null;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "documentation_git_checks" (
	"check_id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"connection_generation" integer NOT NULL,
	"pull_request_number" integer NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"result" jsonb,
	"check_run_id" integer,
	"last_error" text,
	"error_phase" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"lease_token" text,
	"lease_expires_at" timestamp,
	"next_attempt_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documentation_git_checks" ADD CONSTRAINT "documentation_git_checks_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documentation_git_checks_poll_idx" ON "documentation_git_checks" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "documentation_git_checks_active_pr_idx" ON "documentation_git_checks" USING btree ("team_id","pull_request_number") WHERE "documentation_git_checks"."status" in ('queued', 'validating', 'reporting');
--> statement-breakpoint
ALTER TABLE "documentation_git_bindings" ADD COLUMN "next_pr_reconcile_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "documentation_git_bindings" ADD COLUMN "last_pr_reconcile_error" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documentation_git_bindings_pr_reconcile_idx" ON "documentation_git_bindings" USING btree ("status","next_pr_reconcile_at");
--> statement-breakpoint
ALTER TABLE "documentation_git_checks" ALTER COLUMN "pull_request_number" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "documentation_git_checks" ADD COLUMN "sync_run_id" text;--> statement-breakpoint
ALTER TABLE "documentation_git_checks" ADD COLUMN "publication_result" jsonb;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "documentation_git_checks_sync_run_idx" ON "documentation_git_checks" USING btree ("team_id","sync_run_id");
--> statement-breakpoint
ALTER TABLE "documentation_git_jobs" ADD COLUMN "diagnostic_report" jsonb;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "documentation_git_migration_prs" (
	"plan_id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"setup_id" text NOT NULL,
	"actor_credential" jsonb NOT NULL,
	"idempotency_key" text NOT NULL,
	"input_hash" text NOT NULL,
	"policy_epoch" integer NOT NULL,
	"purge_generation" integer NOT NULL,
	"initialize_empty_repository" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"owner_id" text NOT NULL,
	"branch" text NOT NULL,
	"base_sha" text,
	"tree_sha" text,
	"commit_sha" text,
	"bootstrap_sha" text,
	"pull_request_number" integer,
	"pull_request_url" text,
	"merged_commit_sha" text,
	"diagnostic" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp DEFAULT now() NOT NULL,
	"lease_token" text,
	"lease_expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documentation_git_migration_prs" ADD CONSTRAINT "documentation_git_migration_prs_plan_id_documentation_git_migrations_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."documentation_git_migrations"("plan_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documentation_git_migration_prs" ADD CONSTRAINT "documentation_git_migration_prs_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documentation_git_migration_prs" ADD CONSTRAINT "documentation_git_migration_prs_setup_id_documentation_git_setups_setup_id_fk" FOREIGN KEY ("setup_id") REFERENCES "public"."documentation_git_setups"("setup_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "documentation_git_migration_prs_idempotency_idx" ON "documentation_git_migration_prs" USING btree ("team_id","idempotency_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documentation_git_migration_prs_work_idx" ON "documentation_git_migration_prs" USING btree ("status","next_attempt_at");
--> statement-breakpoint
ALTER TABLE "documentation_git_preflights" ALTER COLUMN "commit_sha" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "documentation_git_preflights" ALTER COLUMN "manifest" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "documentation_git_checks" ALTER COLUMN "check_run_id" SET DATA TYPE bigint;
