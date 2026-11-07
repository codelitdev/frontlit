-- Changelog management (docs/changelog-management.md).
-- 1. Remove the product-update GitHub import's stored personal access tokens.
--    Only `integrations` rows for the removed "github" provider are deleted;
--    the docs/pages GitHub App lives in documentation_git_* tables and the
--    SendLit key ("sendlit" rows) is untouched.
DELETE FROM "integrations" WHERE "provider" = 'github';
--> statement-breakpoint
-- 2. Normalize changelog meta (published and draft) to the new contract:
--    labels limited to the Keep a Changelog types ("improved" -> "changed",
--    unknown labels such as "prerelease" dropped, duplicates removed),
--    releaseDate reduced to YYYY-MM-DD (GitHub imports stored a timestamp),
--    and the import-only "github" key removed.
CREATE OR REPLACE FUNCTION pg_temp.frontlit_changelog_meta(m jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT (coalesce(m, '{}'::jsonb) - 'github' - 'labels' - 'releaseDate')
    || jsonb_build_object(
      'labels',
      coalesce(
        (
          SELECT jsonb_agg(label ORDER BY first_seen)
          FROM (
            SELECT
              CASE WHEN value = 'improved' THEN 'changed' ELSE value END AS label,
              min(ordinality) AS first_seen
            FROM jsonb_array_elements_text(
              CASE WHEN jsonb_typeof(m -> 'labels') = 'array' THEN m -> 'labels' ELSE '[]'::jsonb END
            ) WITH ORDINALITY
            GROUP BY 1
          ) mapped
          WHERE label IN ('added', 'changed', 'deprecated', 'removed', 'fixed', 'security')
        ),
        '[]'::jsonb
      )
    )
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
