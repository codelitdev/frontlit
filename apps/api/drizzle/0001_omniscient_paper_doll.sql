ALTER TABLE "team_settings" ADD COLUMN "shared_widgets" jsonb DEFAULT '{"header":{"widgetId":"shared-header","name":"header","deleteable":false,"shared":true,"settings":{}},"footer":{"widgetId":"shared-footer","name":"footer","deleteable":false,"shared":true,"settings":{}}}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "team_settings" ADD COLUMN "draft_shared_widgets" jsonb DEFAULT '{"header":{"widgetId":"shared-header","name":"header","deleteable":false,"shared":true,"settings":{}},"footer":{"widgetId":"shared-footer","name":"footer","deleteable":false,"shared":true,"settings":{}}}'::jsonb NOT NULL;--> statement-breakpoint

-- Preserve any header/footer already customized on the homepage before page
-- layouts are reduced to team-shared placeholders.
UPDATE "team_settings" AS settings
SET
    "shared_widgets" = jsonb_build_object(
        'header',
        COALESCE(
            (
                SELECT widget
                FROM "pages" AS page,
                     jsonb_array_elements(page."layout") AS widget
                WHERE page."team_id" = settings."team_id"
                  AND page."slug" = ''
                  AND widget->>'name' = 'header'
                LIMIT 1
            ),
            settings."shared_widgets"->'header'
        ),
        'footer',
        COALESCE(
            (
                SELECT widget
                FROM "pages" AS page,
                     jsonb_array_elements(page."layout") AS widget
                WHERE page."team_id" = settings."team_id"
                  AND page."slug" = ''
                  AND widget->>'name' = 'footer'
                LIMIT 1
            ),
            settings."shared_widgets"->'footer'
        )
    ),
    "draft_shared_widgets" = jsonb_build_object(
        'header',
        COALESCE(
            (
                SELECT widget
                FROM "pages" AS page,
                     jsonb_array_elements(page."draft_layout") AS widget
                WHERE page."team_id" = settings."team_id"
                  AND page."slug" = ''
                  AND widget->>'name' = 'header'
                LIMIT 1
            ),
            settings."draft_shared_widgets"->'header'
        ),
        'footer',
        COALESCE(
            (
                SELECT widget
                FROM "pages" AS page,
                     jsonb_array_elements(page."draft_layout") AS widget
                WHERE page."team_id" = settings."team_id"
                  AND page."slug" = ''
                  AND widget->>'name' = 'footer'
                LIMIT 1
            ),
            settings."draft_shared_widgets"->'footer'
        )
    );--> statement-breakpoint

-- Every existing page gets exactly one locked header first and footer last.
-- Body order is retained; shared settings now live only in team_settings.
UPDATE "pages" AS page
SET
    "layout" =
        jsonb_build_array(
            jsonb_build_object(
                'widgetId',
                COALESCE(
                    (
                        SELECT widget->>'widgetId'
                        FROM jsonb_array_elements(page."layout") AS widget
                        WHERE widget->>'name' = 'header'
                        LIMIT 1
                    ),
                    'header-' || page."page_id"
                ),
                'name', 'header',
                'deleteable', false,
                'shared', true
            )
        )
        || COALESCE(
            (
                SELECT jsonb_agg(widget ORDER BY ordinal)
                FROM jsonb_array_elements(page."layout") WITH ORDINALITY AS body(widget, ordinal)
                WHERE widget->>'name' NOT IN ('header', 'footer')
            ),
            '[]'::jsonb
        )
        || jsonb_build_array(
            jsonb_build_object(
                'widgetId',
                COALESCE(
                    (
                        SELECT widget->>'widgetId'
                        FROM jsonb_array_elements(page."layout") AS widget
                        WHERE widget->>'name' = 'footer'
                        LIMIT 1
                    ),
                    'footer-' || page."page_id"
                ),
                'name', 'footer',
                'deleteable', false,
                'shared', true
            )
        ),
    "draft_layout" =
        jsonb_build_array(
            jsonb_build_object(
                'widgetId',
                COALESCE(
                    (
                        SELECT widget->>'widgetId'
                        FROM jsonb_array_elements(page."draft_layout") AS widget
                        WHERE widget->>'name' = 'header'
                        LIMIT 1
                    ),
                    'draft-header-' || page."page_id"
                ),
                'name', 'header',
                'deleteable', false,
                'shared', true
            )
        )
        || COALESCE(
            (
                SELECT jsonb_agg(widget ORDER BY ordinal)
                FROM jsonb_array_elements(page."draft_layout") WITH ORDINALITY AS body(widget, ordinal)
                WHERE widget->>'name' NOT IN ('header', 'footer')
            ),
            '[]'::jsonb
        )
        || jsonb_build_array(
            jsonb_build_object(
                'widgetId',
                COALESCE(
                    (
                        SELECT widget->>'widgetId'
                        FROM jsonb_array_elements(page."draft_layout") AS widget
                        WHERE widget->>'name' = 'footer'
                        LIMIT 1
                    ),
                    'draft-footer-' || page."page_id"
                ),
                'name', 'footer',
                'deleteable', false,
                'shared', true
            )
        );
