ALTER TABLE "pages" DROP CONSTRAINT "pages_theme_id_themes_id_fk";--> statement-breakpoint

-- Page/theme APIs expose public `thm_*` identifiers, while the old FK stored
-- the themes table's internal id. Preserve every existing custom-theme
-- selection while moving the column to its public logical identifier.
UPDATE "pages" AS page
SET "theme_id" = theme."theme_id"
FROM "themes" AS theme
WHERE page."theme_id" = theme."id";
