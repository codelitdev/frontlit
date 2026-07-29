ALTER TABLE "chatbot_settings" ADD COLUMN "variant" text DEFAULT 'bubble' NOT NULL;--> statement-breakpoint
ALTER TABLE "chatbot_settings" ADD COLUMN "widget_style" jsonb DEFAULT '{}'::jsonb NOT NULL;
