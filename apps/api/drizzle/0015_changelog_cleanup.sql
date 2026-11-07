-- Changelog management (docs/changelog-management.md).
-- 1. Remove the product-update GitHub import's stored personal access tokens.
--    Only `integrations` rows for the removed "github" provider are deleted;
--    the docs/pages GitHub App lives in documentation_git_* tables and the
--    SendLit key ("sendlit" rows) is untouched.
DELETE FROM "integrations" WHERE "provider" = 'github';
--> statement-breakpoint
-- 2. Normalize changelog meta (published and draft) to the new contract: an
--    entry is a title, body and optional release date. releaseDate is reduced
--    to YYYY-MM-DD (GitHub imports stored a timestamp) and the removed
--    "version", "labels" and import-only "github" keys are dropped.
CREATE OR REPLACE FUNCTION pg_temp.frontlit_changelog_meta(m jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT (coalesce(m, '{}'::jsonb) - 'github' - 'version' - 'labels' - 'releaseDate')
    || CASE
      WHEN m ->> 'releaseDate' ~ '^\d{4}-\d{2}-\d{2}'
        THEN jsonb_build_object('releaseDate', left(m ->> 'releaseDate', 10))
      ELSE '{}'::jsonb
    END
$$;
--> statement-breakpoint
UPDATE "documents"
SET
  "meta" = pg_temp.frontlit_changelog_meta("meta"),
  "draft_meta" = pg_temp.frontlit_changelog_meta("draft_meta")
WHERE "kind" = 'changelog';
