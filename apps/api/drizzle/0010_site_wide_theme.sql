ALTER TABLE "team_settings" ADD COLUMN "theme_id" text;--> statement-breakpoint
INSERT INTO "team_settings" ("id", "team_id", "theme_id")
SELECT 'migrated_settings_' || "team"."id", "team"."id", "homepage"."theme_id"
FROM "teams" AS "team"
LEFT JOIN "pages" AS "homepage"
  ON "homepage"."team_id" = "team"."id"
 AND "homepage"."slug" = ''
WHERE NOT EXISTS (
  SELECT 1
  FROM "team_settings" AS "existing"
  WHERE "existing"."team_id" = "team"."id"
);--> statement-breakpoint
UPDATE "team_settings" AS "settings"
SET "theme_id" = "homepage"."theme_id"
FROM "pages" AS "homepage"
WHERE "homepage"."team_id" = "settings"."team_id"
  AND "homepage"."slug" = ''
  AND "homepage"."theme_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "pages" DROP COLUMN "theme_id";
