ALTER TABLE "ai_settings" ADD COLUMN IF NOT EXISTS "embedding_provider" text;
--> statement-breakpoint
ALTER TABLE "ai_settings" ADD COLUMN IF NOT EXISTS "encrypted_embedding_api_key" text;
--> statement-breakpoint
ALTER TABLE "ai_settings" ADD COLUMN IF NOT EXISTS "embedding_deployment" text;
--> statement-breakpoint
ALTER TABLE "ai_settings" ADD COLUMN IF NOT EXISTS "embedding_endpoint" text;
