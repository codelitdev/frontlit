-- Rewrites stored document featured images to { mediaId?, url, thumbnailUrl?, alt }.
-- The old normalizer copied the FrontLit `med_…` id into `mediaLitId`; that
-- value becomes `mediaId` and every other legacy key is dropped.
CREATE OR REPLACE FUNCTION frontlit_canonical_featured_image(image jsonb) RETURNS jsonb AS $$
  SELECT CASE
    WHEN image IS NULL OR jsonb_typeof(image) <> 'object'
      OR COALESCE(image->>'url', image->>'file', image->>'src') IS NULL THEN NULL
    ELSE jsonb_strip_nulls(jsonb_build_object(
      'mediaId', CASE
        WHEN image->>'mediaId' LIKE 'med\_%' THEN image->>'mediaId'
        WHEN image->>'mediaLitId' LIKE 'med\_%' THEN image->>'mediaLitId'
      END,
      'url', COALESCE(image->>'url', image->>'file', image->>'src'),
      'thumbnailUrl', COALESCE(image->>'thumbnailUrl', image->>'thumbnail'),
      'alt', NULLIF(COALESCE(image->>'alt', image->>'caption'), '')
    ))
  END
$$ LANGUAGE sql IMMUTABLE;
--> statement-breakpoint
UPDATE "documents"
SET "featured_image" = frontlit_canonical_featured_image("featured_image"),
    "draft_featured_image" = frontlit_canonical_featured_image("draft_featured_image")
WHERE "featured_image" IS NOT NULL OR "draft_featured_image" IS NOT NULL;
--> statement-breakpoint
DROP FUNCTION frontlit_canonical_featured_image(jsonb);
