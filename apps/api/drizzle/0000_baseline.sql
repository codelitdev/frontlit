CREATE TABLE IF NOT EXISTS "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"auth_user_id" text,
	"email" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_auth_user_id_unique" UNIQUE("auth_user_id"),
	CONSTRAINT "accounts_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ai_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"provider" text NOT NULL,
	"model" text,
	"model_settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"region" text,
	"azure_endpoint" text,
	"encrypted_api_key" text,
	"embedding_provider" text,
	"encrypted_embedding_api_key" text,
	"embedding_deployment" text,
	"embedding_endpoint" text,
	"index_articles" boolean DEFAULT false NOT NULL,
	"index_changelog" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ai_settings_team_id_unique" UNIQUE("team_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ai_usage_daily" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"usage_date" text NOT NULL,
	"reserved_tokens" integer DEFAULT 0 NOT NULL,
	"used_tokens" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "api_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"name" text,
	"key_hash" text NOT NULL,
	"key_prefix" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "api_keys_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auth_account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auth_oauth_access_token" (
	"id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"client_id" text NOT NULL,
	"session_id" text,
	"user_id" text,
	"reference_id" text,
	"authorization_code_id" text,
	"resources" text[],
	"requested_user_info_claims" text[],
	"refresh_id" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"scopes" text[] NOT NULL,
	"confirmation" jsonb,
	CONSTRAINT "auth_oauth_access_token_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auth_oauth_client" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"client_secret" text,
	"client_discovery_id" text,
	"disabled" boolean DEFAULT false,
	"skip_consent" boolean,
	"enable_end_session" boolean,
	"subject_type" text,
	"scopes" text[],
	"client_credentials_scopes" text[] DEFAULT '{}' NOT NULL,
	"user_id" text,
	"created_at" timestamp with time zone,
	"updated_at" timestamp with time zone,
	"name" text,
	"uri" text,
	"icon" text,
	"contacts" text[],
	"tos" text,
	"policy" text,
	"software_id" text,
	"software_version" text,
	"software_statement" text,
	"redirect_uris" text[] NOT NULL,
	"post_logout_redirect_uris" text[],
	"backchannel_logout_uri" text,
	"backchannel_logout_session_required" boolean,
	"token_endpoint_auth_method" text,
	"application_type" text,
	"jwks" text,
	"jwks_uri" text,
	"grant_types" text[],
	"response_types" text[],
	"public" boolean,
	"type" text,
	"require_pkce" boolean,
	"dpop_bound_access_tokens" boolean DEFAULT false,
	"reference_id" text,
	"metadata" jsonb,
	CONSTRAINT "auth_oauth_client_client_id_unique" UNIQUE("client_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auth_oauth_client_assertion" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auth_oauth_client_resource" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"resource_id" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auth_oauth_consent" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"user_id" text,
	"reference_id" text,
	"resources" text[],
	"requested_user_info_claims" text[],
	"scopes" text[] NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auth_oauth_refresh_token" (
	"id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"client_id" text NOT NULL,
	"session_id" text,
	"user_id" text NOT NULL,
	"reference_id" text,
	"authorization_code_id" text,
	"resources" text[],
	"requested_user_info_claims" text[],
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"revoked" timestamp with time zone,
	"rotated_at" timestamp with time zone,
	"rotation_replay_response" text,
	"rotation_replay_expires_at" timestamp with time zone,
	"auth_time" timestamp with time zone,
	"confirmation" jsonb,
	"scopes" text[] NOT NULL,
	CONSTRAINT "auth_oauth_refresh_token_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auth_oauth_resource" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"name" text NOT NULL,
	"access_token_ttl" integer,
	"refresh_token_ttl" integer,
	"signing_algorithm" text,
	"signing_key_id" text,
	"allowed_scopes" text[],
	"custom_claims" jsonb,
	"dpop_bound_access_tokens_required" boolean DEFAULT false NOT NULL,
	"disabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone,
	"updated_at" timestamp with time zone,
	"policy_version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb,
	CONSTRAINT "auth_oauth_resource_identifier_unique" UNIQUE("identifier")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auth_session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"reauthenticated_at" timestamp with time zone,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "auth_session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auth_user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "auth_user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auth_verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "authorization_audit_events" (
	"id" text PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"team_public_id" text NOT NULL,
	"actor_account_id" text,
	"target_member_id" text,
	"target_email" text,
	"before_permissions" text[],
	"after_permissions" text[],
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chatbot_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"name" text DEFAULT 'Assistant' NOT NULL,
	"greeting" text,
	"accent_color" text,
	"escalation_enabled" boolean DEFAULT false NOT NULL,
	"variant" text DEFAULT 'bubble' NOT NULL,
	"widget_style" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "chatbot_settings_team_id_unique" UNIQUE("team_id")
);
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
CREATE TABLE IF NOT EXISTS "document_index_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"document_id" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"generation" integer DEFAULT 0 NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"lease_expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"started_at" timestamp,
	"finished_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "documents" (
	"id" text PRIMARY KEY NOT NULL,
	"document_id" text NOT NULL,
	"team_id" text NOT NULL,
	"kind" text NOT NULL,
	"slug" text NOT NULL,
	"title" text,
	"content" jsonb,
	"excerpt" text,
	"featured_image" jsonb,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"published_at" timestamp,
	"draft_title" text NOT NULL,
	"draft_content" jsonb NOT NULL,
	"draft_excerpt" text,
	"draft_featured_image" jsonb,
	"draft_meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"author_account_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "documents_document_id_unique" UNIQUE("document_id"),
	CONSTRAINT "document_id_prefix_check" CHECK ("document_id" LIKE 'doc\_%' ESCAPE '\')
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "email_reply_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"team_id" text NOT NULL,
	"ticket_id" text NOT NULL,
	"requester_email" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "email_reply_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inbound_emails" (
	"id" text PRIMARY KEY NOT NULL,
	"message_id" text NOT NULL,
	"team_id" text NOT NULL,
	"ticket_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "inbound_emails_message_id_unique" UNIQUE("message_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inbox_ai_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"ticket_id" text NOT NULL,
	"trigger_message_id" text NOT NULL,
	"channel" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"skip_reason" text,
	"stop_reason" text,
	"last_error" text,
	"retrieval" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"lease_expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"started_at" timestamp,
	"finished_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inbox_ai_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"channel" text NOT NULL,
	"auto_reply" boolean DEFAULT false NOT NULL,
	"escalate_on_visitor_request" boolean DEFAULT true NOT NULL,
	"escalate_when_unsure" boolean DEFAULT true NOT NULL,
	"escalate_topics" text[] DEFAULT '{}'::text[] NOT NULL,
	"escalate_after_bot_turns" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
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
CREATE TABLE IF NOT EXISTS "auth_jwks" (
	"id" text PRIMARY KEY NOT NULL,
	"public_key" text NOT NULL,
	"private_key" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone,
	"alg" text,
	"crv" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "media" (
	"id" text PRIMARY KEY NOT NULL,
	"media_id" text NOT NULL,
	"team_id" text NOT NULL,
	"media_lit_id" text NOT NULL,
	"url" text NOT NULL,
	"thumbnail_url" text,
	"file_name" text,
	"mime_type" text,
	"size" integer,
	"alt" text,
	"caption" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "media_media_id_unique" UNIQUE("media_id"),
	CONSTRAINT "media_id_prefix_check" CHECK ("media_id" LIKE 'med\_%' ESCAPE '\')
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "oauth_post_login_team_selections" (
	"session_id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "outbox_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"next_attempt_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pages" (
	"id" text PRIMARY KEY NOT NULL,
	"page_id" text NOT NULL,
	"team_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"deletable" boolean DEFAULT true NOT NULL,
	"layout" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"title" text,
	"description" text,
	"social_image" jsonb,
	"robots_allowed" boolean,
	"published_at" timestamp,
	"draft_layout" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"draft_title" text,
	"draft_description" text,
	"draft_social_image" jsonb,
	"draft_robots_allowed" boolean,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "pages_page_id_unique" UNIQUE("page_id"),
	CONSTRAINT "page_id_prefix_check" CHECK ("page_id" LIKE 'pg\_%' ESCAPE '\')
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rate_limit_buckets" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"reset_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "team_invitations" (
	"id" text PRIMARY KEY NOT NULL,
	"invitation_id" text NOT NULL,
	"team_id" text NOT NULL,
	"email" text NOT NULL,
	"permissions" text[] DEFAULT '{}' NOT NULL,
	"invited_by_account_id" text,
	"token_hash" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"accepted_at" timestamp,
	"rejected_at" timestamp,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "team_invitations_invitation_id_unique" UNIQUE("invitation_id"),
	CONSTRAINT "team_invitations_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "invitation_id_prefix_check" CHECK ("invitation_id" LIKE 'tinv\_%' ESCAPE '\')
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "team_members" (
	"id" text PRIMARY KEY NOT NULL,
	"member_id" text NOT NULL,
	"team_id" text NOT NULL,
	"account_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"permissions" text[] DEFAULT '{}' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "team_members_member_id_unique" UNIQUE("member_id"),
	CONSTRAINT "member_id_prefix_check" CHECK ("member_id" LIKE 'tmem\_%' ESCAPE '\')
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "team_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"title" text,
	"subtitle" text,
	"logo" jsonb,
	"theme_id" text,
	"code_injection_head" text,
	"code_injection_body" text,
	"shared_widgets" jsonb DEFAULT '{"header":{"widgetId":"shared-header","name":"header","deletable":false,"moveable":false,"shared":true,"settings":{"verticalPadding":"py-4"}},"footer":{"widgetId":"shared-footer","name":"footer","deletable":false,"moveable":false,"shared":true,"settings":{}}}'::jsonb NOT NULL,
	"draft_shared_widgets" jsonb DEFAULT '{"header":{"widgetId":"shared-header","name":"header","deletable":false,"moveable":false,"shared":true,"settings":{"verticalPadding":"py-4"}},"footer":{"widgetId":"shared-footer","name":"footer","deletable":false,"moveable":false,"shared":true,"settings":{}}}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "team_settings_team_id_unique" UNIQUE("team_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "teams" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"name" text NOT NULL,
	"owner_account_id" text NOT NULL,
	"external_id" text,
	"subdomain" text,
	"custom_domain" text,
	"custom_domain_status" text,
	"custom_domain_verification_token" text,
	"custom_domain_verified_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "teams_team_id_unique" UNIQUE("team_id"),
	CONSTRAINT "teams_external_id_unique" UNIQUE("external_id"),
	CONSTRAINT "teams_subdomain_unique" UNIQUE("subdomain"),
	CONSTRAINT "teams_custom_domain_unique" UNIQUE("custom_domain"),
	CONSTRAINT "team_id_prefix_check" CHECK ("team_id" LIKE 'team\_%' ESCAPE '\'),
	CONSTRAINT "teams_custom_domain_state_check" CHECK ((
                ("custom_domain" IS NULL
                    AND "custom_domain_status" IS NULL
                    AND "custom_domain_verification_token" IS NULL
                    AND "custom_domain_verified_at" IS NULL)
                OR
                ("custom_domain" IS NOT NULL
                    AND "custom_domain_status" IS NOT NULL
                    AND "custom_domain_verification_token" IS NOT NULL
                    AND ("custom_domain_status" <> 'verified' OR "custom_domain_verified_at" IS NOT NULL))
            ))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "themes" (
	"id" text PRIMARY KEY NOT NULL,
	"theme_id" text NOT NULL,
	"team_id" text NOT NULL,
	"name" text NOT NULL,
	"style" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "themes_theme_id_unique" UNIQUE("theme_id"),
	CONSTRAINT "theme_id_prefix_check" CHECK ("theme_id" LIKE 'thm\_%' ESCAPE '\')
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ticket_access_grants" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"ticket_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ticket_access_grants_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ticket_attachments" (
	"id" text PRIMARY KEY NOT NULL,
	"attachment_id" text NOT NULL,
	"team_id" text NOT NULL,
	"ticket_id" text NOT NULL,
	"message_id" text,
	"media_lit_id" text NOT NULL,
	"url" text NOT NULL,
	"thumbnail_url" text,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ticket_attachments_attachment_id_unique" UNIQUE("attachment_id"),
	CONSTRAINT "attachment_id_prefix_check" CHECK ("attachment_id" LIKE 'att\_%' ESCAPE '\')
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ticket_mail_outbox" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"ticket_id" text NOT NULL,
	"sequence" integer NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"payload" jsonb NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"next_attempt_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ticket_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"message_id" text NOT NULL,
	"team_id" text NOT NULL,
	"ticket_id" text NOT NULL,
	"author" text NOT NULL,
	"author_account_id" text,
	"content" jsonb NOT NULL,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ticket_messages_message_id_unique" UNIQUE("message_id"),
	CONSTRAINT "message_id_prefix_check" CHECK ("message_id" LIKE 'tmsg\_%' ESCAPE '\')
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tickets" (
	"id" text PRIMARY KEY NOT NULL,
	"ticket_id" text NOT NULL,
	"team_id" text NOT NULL,
	"subject" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"requester_email" text,
	"requester_name" text,
	"source" text DEFAULT 'form' NOT NULL,
	"access_token_hash" text NOT NULL,
	"assignee_account_id" text,
	"ai_state" text DEFAULT 'idle' NOT NULL,
	"ai_generation" integer DEFAULT 0 NOT NULL,
	"ai_trigger_message_id" text,
	"ai_stop_reason" text,
	"ai_stopped_at" timestamp,
	"last_message_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tickets_ticket_id_unique" UNIQUE("ticket_id"),
	CONSTRAINT "ticket_id_prefix_check" CHECK ("ticket_id" LIKE 'tkt\_%' ESCAPE '\')
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "accounts" ADD CONSTRAINT "accounts_auth_user_id_auth_user_id_fk" FOREIGN KEY ("auth_user_id") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai_settings" ADD CONSTRAINT "ai_settings_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai_usage_daily" ADD CONSTRAINT "ai_usage_daily_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "auth_account" ADD CONSTRAINT "auth_account_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "auth_oauth_access_token" ADD CONSTRAINT "auth_oauth_access_token_client_id_auth_oauth_client_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."auth_oauth_client"("client_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "auth_oauth_access_token" ADD CONSTRAINT "auth_oauth_access_token_session_id_auth_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."auth_session"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "auth_oauth_access_token" ADD CONSTRAINT "auth_oauth_access_token_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "auth_oauth_access_token" ADD CONSTRAINT "auth_oauth_access_token_refresh_id_auth_oauth_refresh_token_id_fk" FOREIGN KEY ("refresh_id") REFERENCES "public"."auth_oauth_refresh_token"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "auth_oauth_client" ADD CONSTRAINT "auth_oauth_client_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "auth_oauth_client_resource" ADD CONSTRAINT "auth_oauth_client_resource_client_id_auth_oauth_client_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."auth_oauth_client"("client_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "auth_oauth_client_resource" ADD CONSTRAINT "auth_oauth_client_resource_resource_id_auth_oauth_resource_identifier_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."auth_oauth_resource"("identifier") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "auth_oauth_consent" ADD CONSTRAINT "auth_oauth_consent_client_id_auth_oauth_client_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."auth_oauth_client"("client_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "auth_oauth_consent" ADD CONSTRAINT "auth_oauth_consent_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "auth_oauth_refresh_token" ADD CONSTRAINT "auth_oauth_refresh_token_client_id_auth_oauth_client_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."auth_oauth_client"("client_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "auth_oauth_refresh_token" ADD CONSTRAINT "auth_oauth_refresh_token_session_id_auth_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."auth_session"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "auth_oauth_refresh_token" ADD CONSTRAINT "auth_oauth_refresh_token_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "auth_session" ADD CONSTRAINT "auth_session_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "authorization_audit_events" ADD CONSTRAINT "authorization_audit_events_actor_account_id_accounts_id_fk" FOREIGN KEY ("actor_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "chatbot_settings" ADD CONSTRAINT "chatbot_settings_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
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
DO $$ BEGIN
 ALTER TABLE "document_index_jobs" ADD CONSTRAINT "document_index_jobs_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "document_index_jobs" ADD CONSTRAINT "document_index_jobs_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documents" ADD CONSTRAINT "documents_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documents" ADD CONSTRAINT "documents_author_account_id_accounts_id_fk" FOREIGN KEY ("author_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "email_reply_tokens" ADD CONSTRAINT "email_reply_tokens_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "email_reply_tokens" ADD CONSTRAINT "email_reply_tokens_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inbound_emails" ADD CONSTRAINT "inbound_emails_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inbound_emails" ADD CONSTRAINT "inbound_emails_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inbox_ai_runs" ADD CONSTRAINT "inbox_ai_runs_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inbox_ai_runs" ADD CONSTRAINT "inbox_ai_runs_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inbox_ai_runs" ADD CONSTRAINT "inbox_ai_runs_trigger_message_id_ticket_messages_id_fk" FOREIGN KEY ("trigger_message_id") REFERENCES "public"."ticket_messages"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inbox_ai_settings" ADD CONSTRAINT "inbox_ai_settings_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
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
 ALTER TABLE "media" ADD CONSTRAINT "media_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "oauth_post_login_team_selections" ADD CONSTRAINT "oauth_post_login_team_selections_session_id_auth_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."auth_session"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "oauth_post_login_team_selections" ADD CONSTRAINT "oauth_post_login_team_selections_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "outbox_jobs" ADD CONSTRAINT "outbox_jobs_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pages" ADD CONSTRAINT "pages_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_invitations" ADD CONSTRAINT "team_invitations_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_invitations" ADD CONSTRAINT "team_invitations_invited_by_account_id_accounts_id_fk" FOREIGN KEY ("invited_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_members" ADD CONSTRAINT "team_members_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;
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
 ALTER TABLE "teams" ADD CONSTRAINT "teams_owner_account_id_accounts_id_fk" FOREIGN KEY ("owner_account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "themes" ADD CONSTRAINT "themes_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ticket_access_grants" ADD CONSTRAINT "ticket_access_grants_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ticket_access_grants" ADD CONSTRAINT "ticket_access_grants_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ticket_attachments" ADD CONSTRAINT "ticket_attachments_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ticket_attachments" ADD CONSTRAINT "ticket_attachments_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ticket_attachments" ADD CONSTRAINT "ticket_attachments_message_id_ticket_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."ticket_messages"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ticket_mail_outbox" ADD CONSTRAINT "ticket_mail_outbox_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ticket_mail_outbox" ADD CONSTRAINT "ticket_mail_outbox_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
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
CREATE UNIQUE INDEX IF NOT EXISTS "ai_usage_daily_team_date_idx" ON "ai_usage_daily" USING btree ("team_id","usage_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "api_keys_team_idx" ON "api_keys" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_account_user_id_idx" ON "auth_account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_oauth_access_token_client_id_idx" ON "auth_oauth_access_token" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_oauth_access_token_session_id_idx" ON "auth_oauth_access_token" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_oauth_access_token_user_id_idx" ON "auth_oauth_access_token" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_oauth_access_token_authorization_code_id_idx" ON "auth_oauth_access_token" USING btree ("authorization_code_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_oauth_access_token_refresh_id_idx" ON "auth_oauth_access_token" USING btree ("refresh_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_oauth_client_user_id_idx" ON "auth_oauth_client" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_oauth_client_resource_client_id_idx" ON "auth_oauth_client_resource" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_oauth_client_resource_resource_id_idx" ON "auth_oauth_client_resource" USING btree ("resource_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "auth_oauth_client_resource_client_id_resource_id_idx" ON "auth_oauth_client_resource" USING btree ("client_id","resource_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_oauth_consent_client_id_idx" ON "auth_oauth_consent" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_oauth_consent_user_id_idx" ON "auth_oauth_consent" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_oauth_refresh_token_client_id_idx" ON "auth_oauth_refresh_token" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_oauth_refresh_token_authorization_code_id_idx" ON "auth_oauth_refresh_token" USING btree ("authorization_code_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_oauth_refresh_token_session_id_idx" ON "auth_oauth_refresh_token" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_oauth_refresh_token_user_id_idx" ON "auth_oauth_refresh_token" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_session_user_id_idx" ON "auth_session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_verification_identifier_idx" ON "auth_verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "authorization_audit_team_created_idx" ON "authorization_audit_events" USING btree ("team_public_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "authorization_audit_expires_idx" ON "authorization_audit_events" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "doc_sections_team_slug_idx" ON "doc_sections" USING btree ("team_id","slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "doc_sections_team_idx" ON "doc_sections" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_chunks_team_idx" ON "document_chunks" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_chunks_embedding_idx" ON "document_chunks" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "document_index_jobs_document_idx" ON "document_index_jobs" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_index_jobs_poll_idx" ON "document_index_jobs" USING btree ("status","lease_expires_at","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "documents_team_kind_slug_idx" ON "documents" USING btree ("team_id","kind","slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documents_team_kind_idx" ON "documents" USING btree ("team_id","kind");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documents_published_idx" ON "documents" USING btree ("team_id","kind","published_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "email_reply_tokens_ticket_requester_idx" ON "email_reply_tokens" USING btree ("team_id","ticket_id","requester_email");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "inbox_ai_runs_ticket_trigger_idx" ON "inbox_ai_runs" USING btree ("ticket_id","trigger_message_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inbox_ai_runs_poll_idx" ON "inbox_ai_runs" USING btree ("status","lease_expires_at","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "inbox_ai_settings_team_channel_idx" ON "inbox_ai_settings" USING btree ("team_id","channel");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "integrations_team_provider_idx" ON "integrations" USING btree ("team_id","provider");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "media_team_idx" ON "media" USING btree ("team_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "media_team_medialit_idx" ON "media" USING btree ("team_id","media_lit_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "outbox_jobs_poll_idx" ON "outbox_jobs" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pages_team_idx" ON "pages" USING btree ("team_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "pages_team_slug_idx" ON "pages" USING btree ("team_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "team_invitations_pending_team_email_idx" ON "team_invitations" USING btree ("team_id","email") WHERE "team_invitations"."status" = 'pending';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_invitations_team_created_idx" ON "team_invitations" USING btree ("team_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_invitations_team_email_idx" ON "team_invitations" USING btree ("team_id","email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_invitations_expires_idx" ON "team_invitations" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "team_members_team_account_idx" ON "team_members" USING btree ("team_id","account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "themes_team_idx" ON "themes" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ticket_access_grants_ticket_idx" ON "ticket_access_grants" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ticket_attachments_ticket_idx" ON "ticket_attachments" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ticket_attachments_message_idx" ON "ticket_attachments" USING btree ("message_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ticket_mail_outbox_ticket_seq_idx" ON "ticket_mail_outbox" USING btree ("ticket_id","sequence");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ticket_mail_outbox_poll_idx" ON "ticket_mail_outbox" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ticket_messages_ticket_idx" ON "ticket_messages" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tickets_team_status_idx" ON "tickets" USING btree ("team_id","status","last_message_at");