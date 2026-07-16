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
	"refresh_id" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"scopes" text[] NOT NULL,
	CONSTRAINT "auth_oauth_access_token_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auth_oauth_client" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"client_secret" text,
	"disabled" boolean DEFAULT false,
	"skip_consent" boolean,
	"enable_end_session" boolean,
	"subject_type" text,
	"scopes" text[],
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
	"token_endpoint_auth_method" text,
	"grant_types" text[],
	"response_types" text[],
	"public" boolean,
	"type" text,
	"require_pkce" boolean,
	"reference_id" text,
	"metadata" jsonb,
	CONSTRAINT "auth_oauth_client_client_id_unique" UNIQUE("client_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auth_oauth_consent" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"user_id" text,
	"reference_id" text,
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
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"revoked" timestamp with time zone,
	"auth_time" timestamp with time zone,
	"scopes" text[] NOT NULL,
	CONSTRAINT "auth_oauth_refresh_token_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auth_session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
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
CREATE TABLE IF NOT EXISTS "auth_jwks" (
	"id" text PRIMARY KEY NOT NULL,
	"public_key" text NOT NULL,
	"private_key" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pages" (
	"id" text PRIMARY KEY NOT NULL,
	"page_id" text NOT NULL,
	"team_id" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"layout" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"theme_id" text,
	"title" text,
	"description" text,
	"social_image" jsonb,
	"robots_allowed" boolean,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "pages_page_id_unique" UNIQUE("page_id"),
	CONSTRAINT "page_id_prefix_check" CHECK ("page_id" LIKE 'pg\_%' ESCAPE '\')
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "team_members" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"account_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "teams" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"name" text NOT NULL,
	"owner_account_id" text NOT NULL,
	"external_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "teams_team_id_unique" UNIQUE("team_id"),
	CONSTRAINT "teams_external_id_unique" UNIQUE("external_id"),
	CONSTRAINT "team_id_prefix_check" CHECK ("team_id" LIKE 'team\_%' ESCAPE '\')
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
DO $$ BEGIN
 ALTER TABLE "accounts" ADD CONSTRAINT "accounts_auth_user_id_auth_user_id_fk" FOREIGN KEY ("auth_user_id") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;
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
 ALTER TABLE "pages" ADD CONSTRAINT "pages_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pages" ADD CONSTRAINT "pages_theme_id_themes_id_fk" FOREIGN KEY ("theme_id") REFERENCES "public"."themes"("id") ON DELETE set null ON UPDATE no action;
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
 ALTER TABLE "teams" ADD CONSTRAINT "teams_owner_account_id_accounts_id_fk" FOREIGN KEY ("owner_account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;
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
CREATE INDEX IF NOT EXISTS "api_keys_team_idx" ON "api_keys" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_account_user_id_idx" ON "auth_account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_oauth_access_token_client_id_idx" ON "auth_oauth_access_token" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_oauth_access_token_session_id_idx" ON "auth_oauth_access_token" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_oauth_access_token_user_id_idx" ON "auth_oauth_access_token" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_oauth_access_token_refresh_id_idx" ON "auth_oauth_access_token" USING btree ("refresh_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_oauth_client_user_id_idx" ON "auth_oauth_client" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_oauth_consent_client_id_idx" ON "auth_oauth_consent" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_oauth_consent_user_id_idx" ON "auth_oauth_consent" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_oauth_refresh_token_client_id_idx" ON "auth_oauth_refresh_token" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_oauth_refresh_token_session_id_idx" ON "auth_oauth_refresh_token" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_oauth_refresh_token_user_id_idx" ON "auth_oauth_refresh_token" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_session_user_id_idx" ON "auth_session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_verification_identifier_idx" ON "auth_verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pages_team_idx" ON "pages" USING btree ("team_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "team_members_team_account_idx" ON "team_members" USING btree ("team_id","account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "themes_team_idx" ON "themes" USING btree ("team_id");