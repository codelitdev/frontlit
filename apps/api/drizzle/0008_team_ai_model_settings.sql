ALTER TABLE "ai_settings"
    ADD COLUMN IF NOT EXISTS "model_settings" jsonb NOT NULL DEFAULT '{}'::jsonb;
--> statement-breakpoint
UPDATE "ai_settings"
SET "model_settings" = jsonb_build_object('chatbot', "model")
WHERE "model" IS NOT NULL
  AND "model_settings" = '{}'::jsonb;
