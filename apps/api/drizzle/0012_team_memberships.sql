ALTER TABLE "teams" DROP CONSTRAINT "teams_owner_account_id_accounts_id_fk";
--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_owner_account_id_accounts_id_fk" FOREIGN KEY ("owner_account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "team_members" ADD COLUMN "member_id" text;
--> statement-breakpoint
ALTER TABLE "team_members" ADD COLUMN "permissions" text[] DEFAULT '{}'::text[] NOT NULL;
--> statement-breakpoint
ALTER TABLE "team_members" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "team_members" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;
--> statement-breakpoint
UPDATE "team_members"
SET "member_id" = 'tmem_' || substr(replace("id", '-', ''), 1, 24)
WHERE "member_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "team_members" ALTER COLUMN "member_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_member_id_unique" UNIQUE("member_id");
--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "member_id_prefix_check" CHECK ("member_id" LIKE 'tmem\_%' ESCAPE '\');
--> statement-breakpoint
UPDATE "team_members" AS "member"
SET "permissions" = ARRAY[
    'team:update',
    'members:read',
    'members:invite',
    'members:manage',
    'pages:read',
    'pages:write',
    'themes:read',
    'themes:write',
    'media:read',
    'media:write',
    'blogs:read',
    'blogs:write',
    'docs:read',
    'docs:write',
    'changelogs:read',
    'changelogs:write',
    'contacts:read',
    'contacts:write',
    'segments:read',
    'segments:write',
    'broadcasts:read',
    'broadcasts:write',
    'broadcasts:send',
    'esp:read',
    'esp:write',
    'chatbot:read',
    'chatbot:write',
    'helpdesk:read',
    'helpdesk:write',
    'domains:read',
    'domains:write',
    'ai:read',
    'ai:write',
    'settings:read',
    'settings:write'
]::text[]
FROM "teams" AS "team"
WHERE "member"."team_id" = "team"."id"
  AND "member"."account_id" <> "team"."owner_account_id";
--> statement-breakpoint
UPDATE "team_members" AS "member"
SET "permissions" = '{}'::text[]
FROM "teams" AS "team"
WHERE "member"."team_id" = "team"."id"
  AND "member"."account_id" = "team"."owner_account_id";
--> statement-breakpoint
DO $$
DECLARE
    missing_owner_count integer;
    extra_owner_role_count integer;
BEGIN
    SELECT count(*) INTO missing_owner_count
    FROM "teams" AS "team"
    WHERE NOT EXISTS (
        SELECT 1
        FROM "team_members" AS "member"
        WHERE "member"."team_id" = "team"."id"
          AND "member"."account_id" = "team"."owner_account_id"
    );
    SELECT count(*) INTO extra_owner_role_count
    FROM "team_members" AS "member"
    JOIN "teams" AS "team" ON "team"."id" = "member"."team_id"
    WHERE "member"."role" = 'owner'
      AND "member"."account_id" <> "team"."owner_account_id";
    IF missing_owner_count > 0 THEN
        RAISE NOTICE 'team_memberships migration: % team(s) missing an accepted owner membership — not auto-repaired', missing_owner_count;
    END IF;
    IF extra_owner_role_count > 0 THEN
        RAISE NOTICE 'team_memberships migration: % unexpected extra owner-role membership(s) — not auto-repaired', extra_owner_role_count;
    END IF;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "team_invitations" (
    "id" text PRIMARY KEY NOT NULL,
    "invitation_id" text NOT NULL,
    "team_id" text NOT NULL,
    "email" text NOT NULL,
    "permissions" text[] DEFAULT '{}'::text[] NOT NULL,
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
ALTER TABLE "team_invitations" ADD CONSTRAINT "team_invitations_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "team_invitations" ADD CONSTRAINT "team_invitations_invited_by_account_id_accounts_id_fk" FOREIGN KEY ("invited_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "team_invitations_pending_team_email_idx" ON "team_invitations" USING btree ("team_id","email") WHERE "status" = 'pending';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_invitations_team_created_idx" ON "team_invitations" USING btree ("team_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_invitations_team_email_idx" ON "team_invitations" USING btree ("team_id","email");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_invitations_expires_idx" ON "team_invitations" USING btree ("expires_at");
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
ALTER TABLE "authorization_audit_events" ADD CONSTRAINT "authorization_audit_events_actor_account_id_accounts_id_fk" FOREIGN KEY ("actor_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "authorization_audit_team_created_idx" ON "authorization_audit_events" USING btree ("team_public_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "authorization_audit_expires_idx" ON "authorization_audit_events" USING btree ("expires_at");
