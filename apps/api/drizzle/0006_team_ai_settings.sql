CREATE TABLE IF NOT EXISTS "ai_settings" (
    "id" text PRIMARY KEY NOT NULL,
    "team_id" text NOT NULL UNIQUE REFERENCES "teams"("id") ON DELETE cascade,
    "provider" text NOT NULL,
    "model" text,
    "encrypted_api_key" text,
    "created_at" timestamp NOT NULL DEFAULT now(),
    "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "ai_settings" ADD COLUMN IF NOT EXISTS "region" text;
--> statement-breakpoint
UPDATE "ai_settings" SET "provider" = 'opencode' WHERE "provider" = 'opencode-go';
