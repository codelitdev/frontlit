ALTER TABLE "pages" RENAME COLUMN "deleteable" TO "deletable";--> statement-breakpoint
UPDATE "pages"
SET "layout" = COALESCE(
  (
    SELECT jsonb_agg(
      ("widget" - 'deleteable')
      || jsonb_build_object(
        'deletable', COALESCE("widget"->'deletable', "widget"->'deleteable', 'true'::jsonb),
        'moveable', COALESCE(
          "widget"->'moveable',
          to_jsonb(CASE WHEN "widget"->>'name' IN ('header', 'footer') THEN false ELSE true END)
        )
      )
      ORDER BY "position"
    )
    FROM jsonb_array_elements("pages"."layout") WITH ORDINALITY AS "item"("widget", "position")
  ),
  '[]'::jsonb
),
"draft_layout" = COALESCE(
  (
    SELECT jsonb_agg(
      ("widget" - 'deleteable')
      || jsonb_build_object(
        'deletable', COALESCE("widget"->'deletable', "widget"->'deleteable', 'true'::jsonb),
        'moveable', COALESCE(
          "widget"->'moveable',
          to_jsonb(CASE WHEN "widget"->>'name' IN ('header', 'footer') THEN false ELSE true END)
        )
      )
      ORDER BY "position"
    )
    FROM jsonb_array_elements("pages"."draft_layout") WITH ORDINALITY AS "item"("widget", "position")
  ),
  '[]'::jsonb
);--> statement-breakpoint
UPDATE "team_settings"
SET "shared_widgets" = jsonb_set(
      jsonb_set(
        replace("shared_widgets"::text, '"deleteable":', '"deletable":')::jsonb,
        '{header,moveable}', 'false'::jsonb, true
      ),
      '{footer,moveable}', 'false'::jsonb, true
    ),
    "draft_shared_widgets" = jsonb_set(
      jsonb_set(
        replace("draft_shared_widgets"::text, '"deleteable":', '"deletable":')::jsonb,
        '{header,moveable}', 'false'::jsonb, true
      ),
      '{footer,moveable}', 'false'::jsonb, true
    );--> statement-breakpoint
ALTER TABLE "team_settings" ALTER COLUMN "shared_widgets" SET DEFAULT '{"header":{"widgetId":"shared-header","name":"header","deletable":false,"moveable":false,"shared":true,"settings":{}},"footer":{"widgetId":"shared-footer","name":"footer","deletable":false,"moveable":false,"shared":true,"settings":{}}}'::jsonb;--> statement-breakpoint
ALTER TABLE "team_settings" ALTER COLUMN "draft_shared_widgets" SET DEFAULT '{"header":{"widgetId":"shared-header","name":"header","deletable":false,"moveable":false,"shared":true,"settings":{}},"footer":{"widgetId":"shared-footer","name":"footer","deletable":false,"moveable":false,"shared":true,"settings":{}}}'::jsonb;--> statement-breakpoint
UPDATE "pages"
SET "layout" = jsonb_insert(
      "layout",
      '{1}',
      jsonb_build_object(
        'widgetId', 'page-content-' || "page_id",
        'name', 'page-content',
        'deletable', false,
        'moveable', true,
        'shared', false
      ),
      false
    )
WHERE "slug" IN ('blog', 'changelog', 'docs')
  AND NOT "layout" @> '[{"name":"page-content"}]'::jsonb;--> statement-breakpoint
UPDATE "pages"
SET "draft_layout" = jsonb_insert(
      "draft_layout",
      '{1}',
      jsonb_build_object(
        'widgetId', 'page-content-' || "page_id",
        'name', 'page-content',
        'deletable', false,
        'moveable', true,
        'shared', false
      ),
      false
    )
WHERE "slug" IN ('blog', 'changelog', 'docs')
  AND NOT "draft_layout" @> '[{"name":"page-content"}]'::jsonb;
